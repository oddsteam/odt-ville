// Character-manifest read surface. The Effect methods return typed Effects
// over the data-layer errors (RequestError | NetworkError | DecodeError) —
// callers `runEdge(...)` them at the React boundary. The read paths return
// the free-form `data` blob; callers normalize it via normalizeManifest
// (kernel). The promise-level loaders below resolve the fallback chain
// (remote → committed default) for plain async callers. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { runEdge } from '../lib/runEdge.ts'
import { normalizeManifest } from '../kernel/characterManifest.js'
import {
  ActiveManifest,
  ManifestSummary,
  ManifestSummaryList,
} from './schema.ts'

const decodeActive = Schema.decodeUnknown(ActiveManifest)
const decodeSummary = Schema.decodeUnknown(ManifestSummary)
const decodeSummaryList = Schema.decodeUnknown(ManifestSummaryList)

function decode<A>(
  path: string,
  decoder: (u: unknown) => Effect.Effect<A, unknown>,
) {
  return (raw: unknown) =>
    Effect.mapError(
      decoder(raw),
      (e) =>
        new DecodeError({
          path,
          reason: e instanceof Error ? e.message : String(e),
        }),
    )
}

// GET /character_manifests/active -> the active manifest's data blob, or null
// (204) when nothing has been saved yet.
export const getActive = (): Effect.Effect<object | null, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/character_manifests/active'
    const raw = yield* http.get(path)
    if (raw === null) return null
    const env = yield* decode(path, decodeActive)(raw)
    return env.data
  })

// GET /character_manifests/for_me -> the envelope of the character this user
// renders (#155, ADR-0009: their pick, else the global active), or null (204)
// when neither exists. Returns the full envelope — callers need the id to
// mark the current choice — with the `data` blob to render.
export const getForMe = (): Effect.Effect<
  ActiveManifest | null,
  HttpError,
  Http
> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/character_manifests/for_me'
    const raw = yield* http.get(path)
    if (raw === null) return null
    return yield* decode(path, decodeActive)(raw)
  })

// POST /character_manifests/:id/select -> make this manifest the current
// user's character; returns its summary.
export const select = (
  id: number,
): Effect.Effect<ManifestSummary, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/character_manifests/${id}/select`
    const raw = yield* http.post(path, {})
    return yield* decode(path, decodeSummary)(raw)
  })

// GET /character_manifests -> roster summaries (no data blobs).
export const list = (): Effect.Effect<
  readonly ManifestSummary[],
  HttpError,
  Http
> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/character_manifests'
    const raw = yield* http.get(path)
    return yield* decode(path, decodeSummaryList)(raw)
  })

// GET /character_manifests/:id -> the full manifest's data blob.
export const getById = (
  id: number,
): Effect.Effect<object, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/character_manifests/${id}`
    const raw = yield* http.get(path)
    const env = yield* decode(path, decodeActive)(raw)
    return env.data
  })

// POST /character_manifests -> the saved envelope (id/name/active/updated_at
// + data). Always saves as the live character (`active: true`).
export const save = (
  manifest: unknown,
): Effect.Effect<ActiveManifest, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/character_manifests'
    const raw = yield* http.post(path, { manifest, active: true })
    return yield* decode(path, decodeActive)(raw)
  })

// GET /character_manifests?owner=me -> the caller's own personal Looks (#398),
// kept out of the shared roster the plain list() returns.
export const listMine = (): Effect.Effect<
  readonly ManifestSummary[],
  HttpError,
  Http
> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/character_manifests?owner=me'
    const raw = yield* http.get(path)
    return yield* decode(path, decodeSummaryList)(raw)
  })

// POST /character_manifests/looks -> save a personal Look (#398). `data` is the
// buildLookData blob (parts + layout). Returns the saved envelope.
export const saveLook = (
  data: unknown,
): Effect.Effect<ActiveManifest, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/character_manifests/looks'
    const raw = yield* http.post(path, { manifest: data })
    return yield* decode(path, decodeActive)(raw)
  })

// DELETE /character_manifests/:id -> drop one of the caller's own Looks (#398).
export const deleteLook = (id: number): Effect.Effect<void, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.del(`/character_manifests/${id}`)
  })

export const CharacterService = {
  getActive,
  getForMe,
  select,
  list,
  listMine,
  getById,
  save,
  saveLook,
  deleteLook,
} as const

// --- promise-level loaders ---------------------------------------------

// Path the preview falls back to when no remote manifest is active (committed
// default).
export const DEFAULT_MANIFEST_URL = '/maps/characters/scout.json'

// Fetch the active manifest from the backend. Returns a normalized manifest,
// or null when nothing is saved (204) or the backend is unreachable (any
// data-layer error -> swallowed to null, so the fallback chain continues).
async function fetchRemoteActive() {
  const data = await runEdge(getActive()).catch((err) => {
    console.warn('fetching remote manifest failed:', err)
    return null
  })
  return data ? normalizeManifest(data) : null
}

// Fetch the character this user renders (#155, ADR-0009: their pick, else the
// global active) — same null-on-204/error contract as fetchRemoteActive.
async function fetchRemoteForMe() {
  const env = await runEdge(getForMe()).catch((err) => {
    console.warn('fetching my manifest failed:', err)
    return null
  })
  return env ? normalizeManifest(env.data) : null
}

// Fetch one manifest by id (#266) — the presence renderer's peer lookup, handed
// to the scene through the registry (ADR-0004). Same null-on-204/error contract
// as the loaders above: null leaves that peer on the bundled fallback stills.
export async function loadManifestById(id: number) {
  const data = await runEdge(getById(id)).catch(() => null)
  return data ? normalizeManifest(data) : null
}

// The rigs a set of NPCs draw from (#294): each catalog row's
// `character_manifest_id` → its manifest, resolved shell-side and handed to the
// renderer as plain data (ADR-0004 — the black box never fetches). Callers choose
// the set: the decorate editor loads every catalogued NPC so a stamp draws at
// once, the play shell only the ones a map placed. Best-effort per NPC — one
// with no rig, or whose manifest won't load, is left out and simply draws
// nothing. Takes the rows structurally, so this stays a character-module concern
// and never learns about the catalog.
export async function loadNpcRigs(
  npcs: readonly { id: number; character_manifest_id: number | null }[],
) {
  const rigs = await Promise.all(
    npcs
      .filter((n) => n.character_manifest_id != null)
      .map(async (n) => ({ id: n.id, manifest: await loadManifestById(n.character_manifest_id!) })),
  )
  return rigs.filter((r) => r.manifest)
}

async function committedDefault() {
  try {
    const res = await fetch(DEFAULT_MANIFEST_URL)
    if (res.ok) return normalizeManifest(await res.json())
  } catch (err) {
    console.warn('fetching default manifest failed:', err)
  }
  return normalizeManifest(null)
}

// Resolve the active manifest deterministically from shared server state:
// remote active, then the committed default. No per-browser override, so every
// client renders the same character (#153). Always returns a normalized
// manifest (never throws). This is the *global* character — the authoring
// surfaces' notion of "current"; the game resolves per user via
// loadMyManifest.
export async function loadActiveManifest() {
  return (await fetchRemoteActive()) || committedDefault()
}

// Resolve the character the current user renders (#155): their pick, else the
// global active (both server-side via for_me), then the committed default.
export async function loadMyManifest() {
  return (await fetchRemoteForMe()) || committedDefault()
}
