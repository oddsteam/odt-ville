// Effect-based monster resource service. Methods return typed Effects over the
// data-layer errors (RequestError | NetworkError | DecodeError) — callers
// `runEdge(...)` them at the React boundary. No React, no DOM. Mirrors the
// tileObjects service shape.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import {
  Monster,
  MonsterPoolEntry,
  MonsterSummary,
  type NewMonster,
  type UpdateMonster,
} from './schema.ts'

const decodeWith =
  <A>(schema: Schema.Schema<A>) =>
  (path: string) =>
  (raw: unknown) =>
    Effect.mapError(
      Schema.decodeUnknown(schema)(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )

const decodeSummaries = decodeWith(Schema.Array(MonsterSummary))
const decodeMonster = decodeWith(Monster)
const decodePool = decodeWith(Schema.Array(MonsterPoolEntry))

// GET /monsters/pool -> the live wild-encounter pool (enabled monsters with
// their sprite image), for the in-game grass roll.
export const pool = (): Effect.Effect<readonly MonsterPoolEntry[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/monsters/pool'
    const raw = yield* http.get(path)
    return yield* decodePool(path)(raw)
  })

// GET /monsters -> roster summaries (no image), each carrying its server-
// computed encounter probability.
export const list = (): Effect.Effect<readonly MonsterSummary[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/monsters'
    const raw = yield* http.get(path)
    return yield* decodeSummaries(path)(raw)
  })

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

// GET /monsters/:id -> the full record incl. image, so the admin edit form can
// pre-fill its fields and preview the monster's current art (the roster summary
// omits the heavy blob).
export const get = (id: number): Effect.Effect<Monster, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/monsters/${id}`
    const raw = yield* http.get(path)
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

export const MonstersService = { list, pool, get, create, update, del } as const
