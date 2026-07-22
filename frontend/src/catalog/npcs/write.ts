// NPC catalog write surface (#260): mutations that change what exists in the
// catalog, split from the reads in service.ts so the write boundary is
// import-separable (#196). Only Content Authoring may import this module; Map
// Authoring reads the catalog via service.ts to fill its trainer picker.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../../lib/http.ts'
import type { HttpError } from '../../lib/http.ts'
import { Npc, type NewNpc, type UpdateNpc } from './schema.ts'

const decodeNpc = (path: string) => (raw: unknown) =>
  Effect.mapError(
    Schema.decodeUnknown(Npc)(raw),
    (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
  )

// POST /npcs -> the created NPC. A duplicate name comes back as a RequestError
// the caller surfaces to the admin.
export const create = (body: NewNpc): Effect.Effect<Npc, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/npcs'
    const raw = yield* http.post(path, body)
    return yield* decodeNpc(path)(raw)
  })

// PATCH /npcs/:id -> the updated NPC. Only the fields in `body` are sent;
// omitting `character_manifest_id` leaves the stored rig untouched.
export const update = (id: number, body: UpdateNpc): Effect.Effect<Npc, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/npcs/${id}`
    const raw = yield* http.patch(path, body)
    return yield* decodeNpc(path)(raw)
  })

// DELETE /npcs/:id -> 204. The picker stops offering it on the next read.
export const del = (id: number): Effect.Effect<void, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.del(`/npcs/${id}`)
  })

export const NpcsWrite = { create, update, del } as const
