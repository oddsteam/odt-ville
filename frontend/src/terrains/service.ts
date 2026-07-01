// Effect-based terrain resource service (#120). `list()` loads the persisted
// terrain priority (GET /terrains); `setOrder(names)` reorders the stack
// (PUT /terrains/order) so the editor flips seam ownership as data. No React,
// no DOM — callers `runEdge(...)` it at the React boundary.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { Terrain } from './schema.ts'

const decodeList = Schema.decodeUnknown(Schema.Array(Terrain))

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

// GET /terrains -> terrains low→high priority.
export const list = (): Effect.Effect<readonly Terrain[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.get('/terrains')
    return yield* decode('/terrains', decodeList)(raw)
  })

// PUT /terrains/order -> the reordered terrains. `order` is the new stack,
// low→high; the server persists priority = position.
export const setOrder = (order: readonly string[]): Effect.Effect<readonly Terrain[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.put('/terrains/order', { order })
    return yield* decode('/terrains/order', decodeList)(raw)
  })

export const TerrainsService = { list, setOrder } as const
