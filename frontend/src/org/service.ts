// Effect-based org roster service — reads only, and permanently so (ADR-0016:
// the app never authors org data, so there is no write.ts sibling). Callers
// `runEdge(...)` at the React boundary. No React, no DOM. Mirrors the catalog
// service shape.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { Employee } from './schema.ts'

// GET /org/employees -> the roster, name-ordered. Admin-gated server-side.
export const list = (): Effect.Effect<readonly Employee[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/org/employees'
    const raw = yield* http.get(path)
    return yield* Effect.mapError(
      Schema.decodeUnknown(Schema.Array(Employee))(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
  })

export const EmployeesService = { list } as const
