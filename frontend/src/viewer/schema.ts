// effect/Schema decoder for the viewer (current-user) endpoint. Mirrors
// MeController#show: a thin user + company envelope used by the app header.
// Decode failures surface as typed errors at the data-layer edge.

import * as Schema from 'effect/Schema'

export const Viewer = Schema.Struct({
  user: Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    role: Schema.String,
    // The stable Keycloak sub (#88) — presence frames carry it, and the
    // client tells its own echo apart from other players by it.
    external_id: Schema.String,
    // Our own avatar path (ADR-0012), or null when the person has none — the
    // header renders its initials fallback then. Never Basecamp's signed URL.
    avatar_url: Schema.NullOr(Schema.String),
  }),
  company: Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
  }),
  // Realm roles from the token (#100) — drives the /admin route guard.
  roles: Schema.Array(Schema.String),
})
export type Viewer = Schema.Schema.Type<typeof Viewer>
