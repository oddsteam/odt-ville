// Ground-tile catalog write surface (#196): mutations that change what exists
// in the catalog, split from the reads in service.ts so the write boundary is
// import-separable. Only Content Authoring may import this module; Map
// Authoring reads the catalog via service.ts.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../../lib/http.ts'
import type { HttpError } from '../../lib/http.ts'
import { GroundTile, type NewGroundTile } from './schema.ts'

const decodeOne = Schema.decodeUnknown(GroundTile)

// POST /ground_tiles -> the upserted tile (by tileset/col/row).
export const save = (
  body: NewGroundTile,
): Effect.Effect<GroundTile, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.post('/ground_tiles', body)
    return yield* Effect.mapError(
      decodeOne(raw),
      (e) =>
        new DecodeError({
          path: '/ground_tiles',
          reason: e instanceof Error ? e.message : String(e),
        }),
    )
  })

// DELETE /ground_tiles/:id -> null
export const remove = (id: number): Effect.Effect<null, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.del(`/ground_tiles/${id}`)
    return null
  })

export const GroundTilesWrite = { save, remove } as const
