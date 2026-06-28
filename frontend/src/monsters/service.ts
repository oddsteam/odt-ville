// Effect-based monster resource service. Methods return typed Effects over the
// data-layer errors (RequestError | NetworkError | DecodeError) — callers
// `runEdge(...)` them at the React boundary. No React, no DOM. Mirrors the
// tileObjects service shape.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { MonsterSummary } from './schema.ts'

const decodeSummaries =
  (path: string) =>
  (raw: unknown) =>
    Effect.mapError(
      Schema.decodeUnknown(Schema.Array(MonsterSummary))(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )

// GET /monsters -> roster summaries (no image), each carrying its server-
// computed encounter probability.
export const list = (): Effect.Effect<readonly MonsterSummary[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/monsters'
    const raw = yield* http.get(path)
    return yield* decodeSummaries(path)(raw)
  })

export const MonstersService = { list } as const
