// Effect-based admin users service (#430). Reads only — the grant/revoke writes
// arrive in #431/#432. Callers `runEdge(...)` at the React boundary; no React,
// no DOM. Mirrors the org and viewer service shapes.

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

export const AdminUsersService = { list } as const
