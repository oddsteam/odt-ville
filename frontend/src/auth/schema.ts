// effect/Schema decoders for the admin users roster (#430, ADR-0010). Mirrors
// Api::V1::Auth::UsersController#index: every login with its role badges, each
// tagged by source so the console knows which grants it may revoke (#431/#432).

import * as Schema from 'effect/Schema'

// One admin badge on a roster row. `source` is `app` for an auth_user_roles
// grant (revocable in this console) or `keycloak` for a realm role (not ours to
// remove). Keycloak badges are only ever the caller's own — the server cannot
// read another user's token.
//
// `granted_by`/`granted_at` are the App grant's audit line (#431): who issued it
// and when. Absent on a Keycloak badge — it is a realm role, not our grant — and
// `granted_by` is null for a console/bootstrap grant with no actor.
export const RoleBadge = Schema.Struct({
  role: Schema.String,
  source: Schema.Literal('app', 'keycloak'),
  granted_by: Schema.optional(Schema.NullOr(Schema.String)),
  granted_at: Schema.optional(Schema.NullOr(Schema.String)),
})
export type RoleBadge = Schema.Schema.Type<typeof RoleBadge>

// One login on the roster, from GET /admin/users. `email` is nullable — a
// local-only user can exist without one.
//
// `external` (#498) and `client_site` (#499) are the two fields the client-
// onboarding console edits (#500). `external` is nullable — null means a login
// never classified Staff vs Client yet. `client_site` is the app-assigned
// hometown site, by name, or null when unassigned.
export const AdminUser = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.NullOr(Schema.String),
  external: Schema.NullOr(Schema.Boolean),
  client_site: Schema.NullOr(Schema.String),
  roles: Schema.Array(RoleBadge),
})
export type AdminUser = Schema.Schema.Type<typeof AdminUser>
