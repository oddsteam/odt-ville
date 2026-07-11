// Effect-based terrain resource service (#120) — reads only; `setOrder` lives
// in write.ts (#196). `list()` loads the persisted terrain priority
// (GET /terrains). No React, no DOM — callers `runEdge(...)` it at the React
// boundary.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../../lib/http.ts'
import type { HttpError } from '../../lib/http.ts'
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

export const TerrainsService = { list } as const
