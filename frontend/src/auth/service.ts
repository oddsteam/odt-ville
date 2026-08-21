// Effect-based admin users service (#430, #431, #432). The read roster plus the
// grant and revoke writes. Callers `runEdge(...)` at the React boundary; no
// React, no DOM. Mirrors the org and viewer service shapes.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { AdminUser } from './schema.ts'

// GET /admin/users -> every login with its role badges, name-ordered.
// Admin-gated server-side.
export const list = (): Effect.Effect<readonly AdminUser[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/admin/users'
    const raw = yield* http.get(path)
    return yield* Effect.mapError(
      Schema.decodeUnknown(Schema.Array(AdminUser))(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
  })

// POST /admin/users/:id/roles -> grant an App role and get the user's updated
// roster row back, so the page flips the badge in place without a reload (#431).
// Admin-gated server-side; re-granting is idempotent.
export const grant = (
  userId: number,
  role: string,
): Effect.Effect<AdminUser, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/admin/users/${userId}/roles`
    const raw = yield* http.post(path, { role })
    return yield* Effect.mapError(
      Schema.decodeUnknown(AdminUser)(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
  })

// DELETE /admin/users/:id/roles/:role -> revoke an App grant and get the user's
// updated roster row back, so the page flips the badge in place without a reload
// (#432). Admin-gated server-side; refuses self-revoke (422) and 404s a role the
// user does not hold as an App grant.
export const revoke = (
  userId: number,
  role: string,
): Effect.Effect<AdminUser, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/admin/users/${userId}/roles/${role}`
    const raw = yield* http.del(path)
    return yield* Effect.mapError(
      Schema.decodeUnknown(AdminUser)(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
  })

// POST /admin/users -> pre-provision a Client by email (#500), before their
// first login and Keycloak account. Returns the created roster row. Admin-gated
// server-side; a blank or duplicate email is a 422.
export const create = (
  input: { email: string; external?: boolean; client_site?: string | null },
): Effect.Effect<AdminUser, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = '/admin/users'
    const raw = yield* http.post(path, input)
    return yield* Effect.mapError(
      Schema.decodeUnknown(AdminUser)(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
  })

// PATCH /admin/users/:id -> set `external` and/or `client_site` on an existing
// user (#500), one field at a time. A blank client_site clears it. Returns the
// updated roster row so the page reflects it without a reload.
export const update = (
  userId: number,
  patch: { external?: boolean; client_site?: string | null },
): Effect.Effect<AdminUser, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/admin/users/${userId}`
    const raw = yield* http.patch(path, patch)
    return yield* Effect.mapError(
      Schema.decodeUnknown(AdminUser)(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )
  })

export const AdminUsersService = { list, grant, revoke, create, update } as const
