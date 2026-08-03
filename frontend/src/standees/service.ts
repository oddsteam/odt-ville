// Effect-based Standees read service (#369, ADR-0015). Standees are read
// alongside a map, never baked into it, so this is a separate GET the shell runs
// as part of loading a map bundle. Reads only — deploy/pickup live in write.ts.
// No React, no DOM; callers `runEdge(...)` at the boundary. Mirrors the NPC
// catalog service shape.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { Standee } from './schema.ts'

const decodeStandees = (path: string) => (raw: unknown) =>
  Effect.mapError(
    Schema.decodeUnknown(Schema.Array(Standee))(raw),
    (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
  )

// GET /maps/:slug/standees -> the Standees standing on this map, for the runtime
// to place their cutouts. Inherits the map's own access gate server-side.
export const list = (mapSlug: string): Effect.Effect<readonly Standee[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/maps/${mapSlug}/standees`
    const raw = yield* http.get(path)
    return yield* decodeStandees(path)(raw)
  })

export const StandeesService = { list } as const
