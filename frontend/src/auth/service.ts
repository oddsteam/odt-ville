// Effect-based admin users service (#430, #431). The read roster plus the grant
// write; the revoke write arrives in #432. Callers `runEdge(...)` at the React
// boundary; no React, no DOM. Mirrors the org and viewer service shapes.

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

export const AdminUsersService = { list, grant } as const
