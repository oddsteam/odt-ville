// Effect-based map resource service. `get(slug)` loads a baked authored map
// (GET /maps/:slug) and decodes it to the runtime BakedMap shape. No React, no
// DOM — callers `runEdge(...)` it at the React boundary. The runtime renders
// whatever this returns without branching on which map it is (ADR-0004).

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { BakedMap } from './schema.ts'

const decodeOne = Schema.decodeUnknown(BakedMap)

function decode<A>(path: string, decoder: (u: unknown) => Effect.Effect<A, unknown>) {
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

// GET /maps/:slug -> the baked map for play.
export const get = (slug: string): Effect.Effect<BakedMap, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/maps/${encodeURIComponent(slug)}`
    const raw = yield* http.get(path)
    return yield* decode(path, decodeOne)(raw)
  })

export const MapsService = { get } as const
