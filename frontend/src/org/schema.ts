// effect/Schema decoders for the org roster API (#388, ADR-0016).
//
// A lossy read-model on purpose: the app is a downstream consumer of org data
// and never authors it, so there is no write shape here and there never should
// be — an edit made in this app is destroyed by the next sync.

import * as Schema from 'effect/Schema'

// One person on the company roster, from GET /org/employees. `nickname` is what
// they are actually called and is the label to prefer over `name` (CONTEXT.md
// "Nickname"); `name` is the fallback, not the default.
//
// There is no `departed` flag: `left_on` present IS the departure, carried as
// an ISO date string exactly as the server sends it.
// A client engagement someone is placed at (#389) — `ttb`, `KTC`. Read-only
// here in the strongest sense: assignment happens upstream, so there is no
// decoder for a write shape and no id, only the name that keys it.
export const Site = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literal('client', 'internal'),
})
export type Site = Schema.Schema.Type<typeof Site>

export const Employee = Schema.Struct({
  id: Schema.Number,
  email: Schema.String,
  name: Schema.String,
  nickname: Schema.NullOr(Schema.String),
  join_date: Schema.NullOr(Schema.String),
  left_on: Schema.NullOr(Schema.String),
  // An unordered set — no primary site — that arrives name-ordered so the page
  // does not have to invent one.
  sites: Schema.Array(Site),
  // Whether a Keycloak login is joined to this person (#390). Unlinked is a
  // normal state — someone who has not signed in yet, or whose login email
  // differs — not an error and not a permission.
  linked: Schema.Boolean,
  // Whether the avatar sync can reach a Basecamp face for this person (#391).
  // False is the queue for the manual pass: their Basecamp address differs from
  // their org one, so email could never join them and they render the fallback.
  basecamp_linked: Schema.Boolean,
})
export type Employee = Schema.Schema.Type<typeof Employee>
