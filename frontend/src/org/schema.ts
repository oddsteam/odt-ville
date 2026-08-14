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
export const Employee = Schema.Struct({
  id: Schema.Number,
  email: Schema.String,
  name: Schema.String,
  nickname: Schema.NullOr(Schema.String),
  join_date: Schema.NullOr(Schema.String),
  left_on: Schema.NullOr(Schema.String),
})
export type Employee = Schema.Schema.Type<typeof Employee>
