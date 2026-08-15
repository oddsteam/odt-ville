// effect/Schema decoders for the admin users roster (#430, ADR-0010). Mirrors
// Api::V1::Auth::UsersController#index: every login with its role badges, each
// tagged by source so the console knows which grants it may revoke (#431/#432).

import * as Schema from 'effect/Schema'

// One admin badge on a roster row. `source` is `app` for an auth_user_roles
// grant (revocable in this console) or `keycloak` for a realm role (not ours to
// remove). Keycloak badges are only ever the caller's own — the server cannot
// read another user's token.
export const RoleBadge = Schema.Struct({
  role: Schema.String,
  source: Schema.Literal('app', 'keycloak'),
})
export type RoleBadge = Schema.Schema.Type<typeof RoleBadge>

// One login on the roster, from GET /admin/users. `email` is nullable — a
// local-only user can exist without one.
export const AdminUser = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.NullOr(Schema.String),
  roles: Schema.Array(RoleBadge),
})
export type AdminUser = Schema.Schema.Type<typeof AdminUser>
