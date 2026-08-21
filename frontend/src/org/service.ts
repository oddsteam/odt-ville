// Effect-based org roster service. Reads only — except the one write ADR-0016's
// "no write" carve-out allows: the hand-set Basecamp link (#392) is a fact about
// our Basecamp integration, not about org data, so a human is its authority and
// the sync must not overwrite it. Callers `runEdge(...)` at the React boundary.
// No React, no DOM. Mirrors the catalog service shape.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { BasecampPerson, Employee } from './schema.ts'

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

// GET /org/basecamp_people?q= -> name matches with an inlined face, so the
// operator confirms who they are picking. Server-side search; a short query
// answers empty. Admin-gated.
export const searchBasecampPeople = (
  q: string,
): Effect.Effect<readonly BasecampPerson[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/org/basecamp_people?q=${encodeURIComponent(q)}`
    const raw = yield* http.get(path)
    return yield* Effect.mapError(
      Schema.decodeUnknown(Schema.Array(BasecampPerson))(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
  })

// PATCH /org/employees/:id -> set (or clear, with null) the Basecamp link and
// get the updated row back. The one write in this module (#392). Admin-gated.
export const linkBasecampPerson = (
  employeeId: number,
  basecampPersonId: number | null,
): Effect.Effect<Employee, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/org/employees/${employeeId}`
    const raw = yield* http.patch(path, { basecamp_person_id: basecampPersonId })
    return yield* Effect.mapError(
      Schema.decodeUnknown(Employee)(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
  })

// GET /org/sites -> the Site names, ordered, for admin pickers (#503). A bare
// name list: the community scope is FK-less by name (soft-seam), so a name is
// all a picker needs. Admin-gated server-side.
export const listSites = (): Effect.Effect<readonly string[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/org/sites'
    const raw = yield* http.get(path)
    const payload = yield* Effect.mapError(
      Schema.decodeUnknown(Schema.Struct({ sites: Schema.Array(Schema.String) }))(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
    return payload.sites
  })

export const EmployeesService = { list, searchBasecampPeople, linkBasecampPerson, listSites } as const
