// Monster catalog write surface (#196): mutations that change what exists in
// the catalog, split from the reads in service.ts so the write boundary is
// import-separable. Only Content Authoring may import this module; Map
// Authoring reads the catalog via service.ts.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../../lib/http.ts'
import type { HttpError } from '../../lib/http.ts'
import { Monster, type NewMonster, type UpdateMonster } from './schema.ts'

const decodeMonster = (path: string) => (raw: unknown) =>
  Effect.mapError(
    Schema.decodeUnknown(Monster)(raw),
    (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
  )

// POST /monsters -> the created monster (full record incl. image). Validation
// failures (duplicate name, negative rate) come back as a RequestError the
// caller surfaces to the admin.
export const create = (
  body: NewMonster,
): Effect.Effect<Monster, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/monsters'
    const raw = yield* http.post(path, body)
    return yield* decodeMonster(path)(raw)
  })

// PATCH /monsters/:id -> the updated monster (full record). Only the fields in
// `body` are sent; omitting `image` leaves the stored blob untouched. Saving
// recomputes the pool, so the caller re-fetches the roster. Validation failures
// (duplicate name) come back as a RequestError the caller surfaces.
export const update = (
  id: number,
  body: UpdateMonster,
): Effect.Effect<Monster, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/monsters/${id}`
    const raw = yield* http.patch(path, body)
    return yield* decodeMonster(path)(raw)
  })

// DELETE /monsters/:id -> 204. The pool shrinks, so the caller re-fetches the
// roster to pick up the recomputed probabilities.
export const del = (id: number): Effect.Effect<void, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.del(`/monsters/${id}`)
  })

export const MonstersWrite = { create, update, del } as const
