// Effect-based ground-tile resource service. Methods return typed Effects over
// the data-layer errors (RequestError | NetworkError | DecodeError) — callers
// `runEdge(...)` them at the React boundary. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { GroundTile, type NewGroundTile } from './schema.ts'

const decodeList = Schema.decodeUnknown(Schema.Array(GroundTile))
const decodeOne = Schema.decodeUnknown(GroundTile)

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

// GET /ground_tiles -> GroundTile[] (optionally filtered by surface type).
export const list = (
  type?: string,
): Effect.Effect<readonly GroundTile[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/ground_tiles${type ? `?type=${encodeURIComponent(type)}` : ''}`
    const raw = yield* http.get(path)
    return yield* decode(path, decodeList)(raw)
  })

// POST /ground_tiles -> the upserted tile (by tileset/col/row).
export const save = (
  body: NewGroundTile,
): Effect.Effect<GroundTile, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.post('/ground_tiles', body)
    return yield* decode('/ground_tiles', decodeOne)(raw)
  })

// DELETE /ground_tiles/:id -> null
export const remove = (id: number): Effect.Effect<null, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.del(`/ground_tiles/${id}`)
    return null
  })

export const GroundTilesService = { list, save, remove } as const
