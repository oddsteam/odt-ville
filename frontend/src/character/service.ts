// Effect-based character-manifest resource service (read path). `getActive`
// returns a typed Effect over the data-layer errors — callers `runEdge(...)` it
// at the React boundary. Returns the free-form `data` blob (or null when none
// is active); the caller normalizes it via normalizeManifest. Kept free of
// manifest.js so there's no import cycle. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { ActiveManifest } from './schema.ts'

const decodeActive = Schema.decodeUnknown(ActiveManifest)

const decode = (raw: unknown) =>
  Effect.mapError(
    decodeActive(raw),
    (e) =>
      new DecodeError({
        path: '/character_manifests/active',
        reason: e instanceof Error ? e.message : String(e),
      }),
  )

// GET /character_manifests/active -> the active manifest's data blob, or null
// (204) when nothing has been saved yet.
export const getActive = (): Effect.Effect<object | null, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.get('/character_manifests/active')
    if (raw === null) return null
    const env = yield* decode(raw)
    return env.data
  })

export const CharacterService = { getActive } as const
