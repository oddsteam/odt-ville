// Effect-based NPC catalog resource service — reads only (there is no admin
// CRUD page yet, #259). Methods return typed Effects over the data-layer errors
// (RequestError | NetworkError | DecodeError); callers `runEdge(...)` them at
// the React boundary. No React, no DOM. Mirrors the monsters service shape.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../../lib/http.ts'
import type { HttpError } from '../../lib/http.ts'
import { Npc } from './schema.ts'

const decodeNpcs = (path: string) => (raw: unknown) =>
  Effect.mapError(
    Schema.decodeUnknown(Schema.Array(Npc))(raw),
    (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
  )

// GET /npcs -> the NPC catalog (identity + sprite), for the decorate editor's
// trainer picker and the runtime's duel-sprite resolution.
export const list = (): Effect.Effect<readonly Npc[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/npcs'
    const raw = yield* http.get(path)
    return yield* decodeNpcs(path)(raw)
  })

export const NpcsService = { list } as const
