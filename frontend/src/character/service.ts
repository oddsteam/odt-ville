// Effect-based character-manifest resource service. Methods return typed
// Effects over the data-layer errors (RequestError | NetworkError |
// DecodeError) — callers `runEdge(...)` them at the React boundary. The read
// paths return the free-form `data` blob; callers normalize it via
// normalizeManifest. Kept free of manifest.js so there's no import cycle.
// No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import {
  ActiveManifest,
  ManifestSummaryList,
  type ManifestSummary,
} from './schema.ts'

const decodeActive = Schema.decodeUnknown(ActiveManifest)
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

export const CharacterService = { getActive, list, getById, save } as const
