// Terrain catalog write surface (#196): mutations that change what exists in
// the catalog, split from the reads in service.ts so the write boundary is
// import-separable. Only Content Authoring may import this module; Map
// Authoring reads the catalog via service.ts. Known divergence: the terrain-
// priority reorder tool (#120) still lives in MapEditorPage — that one edge is
// baselined, see .dependency-cruiser.cjs.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../../lib/http.ts'
import type { HttpError } from '../../lib/http.ts'
import { Terrain } from './schema.ts'

const decodeList = Schema.decodeUnknown(Schema.Array(Terrain))

// PUT /terrains/order -> the reordered terrains. `order` is the new stack,
// low→high; the server persists priority = position.
export const setOrder = (order: readonly string[]): Effect.Effect<readonly Terrain[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.put('/terrains/order', { order })
    return yield* Effect.mapError(
      decodeList(raw),
      (e) =>
        new DecodeError({
          path: '/terrains/order',
          reason: e instanceof Error ? e.message : String(e),
        }),
    )
  })

export const TerrainsWrite = { setOrder } as const
