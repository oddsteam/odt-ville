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
  probability: Schema.Number,
  updated_at: Schema.String,
})
export type MonsterSummary = Schema.Schema.Type<typeof MonsterSummary>
