// effect/Schema decoders for the NPC catalog API (#259). Mirrors NpcSerializer
// (`call` = the identity row plus the sprite image the picker previews and the
// runtime duels with). Decode failures surface as typed errors at the data edge.

import * as Schema from 'effect/Schema'

// A catalog NPC from GET /npcs: identity (name, optional battle level, enabled)
// plus the sprite image data URL. `level` is null for an NPC that never duels —
// the duel screen omits the "Lv." line when it's absent.
export const Npc = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  level: Schema.NullOr(Schema.Number),
  enabled: Schema.Boolean,
  image: Schema.String,
})
export type Npc = Schema.Schema.Type<typeof Npc>
