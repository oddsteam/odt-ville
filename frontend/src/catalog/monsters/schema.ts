// effect/Schema decoders for the monster API. Mirrors MonsterSerializer
// (`summary` = the roster row, which omits the heavy image blob). Decode
// failures surface as typed errors at the data-layer edge.

import * as Schema from 'effect/Schema'

// Roster row from GET /monsters (the `summary` serializer): everything but the
// heavy image blob. `probability` is a fraction in [0, 1] computed server-side
// as encounter_rate / sum(enabled rates); disabled monsters report 0.
export const MonsterSummary = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  // The line the monster speaks on a wild encounter; null when unset.
  encounter_dialog: Schema.NullOr(Schema.String),
  encounter_rate: Schema.Number,
  enabled: Schema.Boolean,
  // The named wild-encounter group this monster spawns in (#87), matching an
  // encounter Zone's Pool slug; null = spawns only in the global pool.
  pool: Schema.NullOr(Schema.String),
  probability: Schema.Number,
  updated_at: Schema.String,
})
export type MonsterSummary = Schema.Schema.Type<typeof MonsterSummary>

// The full record from POST /monsters (the `call` serializer): a roster row
// plus the heavy image data URL the create endpoint echoes back.
export const Monster = Schema.Struct({
  ...MonsterSummary.fields,
  image: Schema.String,
})
export type Monster = Schema.Schema.Type<typeof Monster>

// A wild-encounter pool row from GET /monsters/pool: just what the game needs
// to roll and render an encounter — id, name, authored dialog, weight, and the
// sprite image (enabled-only, so no probability/enabled fields).
export const MonsterPoolEntry = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  // The line the monster speaks on a wild encounter; null when unset.
  encounter_dialog: Schema.NullOr(Schema.String),
  encounter_rate: Schema.Number,
  image: Schema.String,
})
export type MonsterPoolEntry = Schema.Schema.Type<typeof MonsterPoolEntry>

// Body the admin form POSTs to create a monster. Echoes the controller's
// assignment list: name, image (PNG data URL), encounter dialog, encounter
// rate, enabled. encounter_dialog may be empty; the others are required.
export const NewMonster = Schema.Struct({
  name: Schema.String,
  image: Schema.String,
  encounter_dialog: Schema.String,
  encounter_rate: Schema.Number,
  enabled: Schema.Boolean,
  // Pool slug; the server stores a blank as null (global-only).
  pool: Schema.String,
})
export type NewMonster = Schema.Schema.Type<typeof NewMonster>

// Body the admin form PATCHes to edit a monster. Every field is optional: the
// form sends only what it's setting, so leaving the image unchanged simply
// omits `image` and the server keeps the stored blob. Present fields keep their
// types (a string rate is still rejected).
export const UpdateMonster = Schema.partial(NewMonster)
export type UpdateMonster = Schema.Schema.Type<typeof UpdateMonster>
