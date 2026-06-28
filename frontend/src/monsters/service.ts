// Effect-based monster resource service. Methods return typed Effects over the
// data-layer errors (RequestError | NetworkError | DecodeError) — callers
// `runEdge(...)` them at the React boundary. No React, no DOM. Mirrors the
// tileObjects service shape.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { Monster, MonsterSummary, type NewMonster } from './schema.ts'

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

export const MonstersService = { list, create } as const
