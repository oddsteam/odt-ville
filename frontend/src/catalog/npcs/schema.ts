// effect/Schema decoders for the NPC catalog API (#259, reshaped in #260).
// Mirrors NpcSerializer: identity plus the id of the mapped rig that draws it.
// Decode failures surface as typed errors at the data edge.

import * as Schema from 'effect/Schema'

// A catalog NPC from GET /npcs. `character_manifest_id` names a rig authored in
// the sprite mapper — the same roster a user picks their own character from
// (ADR-0009), consumed here as the admin's track. Null when no rig is picked
// yet, or when the rig it named was deleted (the FK nullifies rather than
// cascading). `level` is null for an NPC that never duels — the duel screen
// omits the "Lv." line when it's absent.
export const Npc = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  level: Schema.NullOr(Schema.Number),
  enabled: Schema.Boolean,
  character_manifest_id: Schema.NullOr(Schema.Number),
})
export type Npc = Schema.Schema.Type<typeof Npc>

// Body the NPC admin POSTs to create an NPC (#260). Echoes the controller's
// assignment list; the backend reads a blank level or rig as unset rather than
// as 0.
export const NewNpc = Schema.Struct({
  name: Schema.String,
  character_manifest_id: Schema.NullOr(Schema.Number),
  level: Schema.NullOr(Schema.Number),
  enabled: Schema.Boolean,
})
export type NewNpc = Schema.Schema.Type<typeof NewNpc>

// Body the NPC admin PATCHes to edit one. Every field is optional: the form
// sends only what it's setting, so leaving the rig alone simply omits
// `character_manifest_id` and the server keeps the stored ref.
export const UpdateNpc = Schema.partial(NewNpc)
export type UpdateNpc = Schema.Schema.Type<typeof UpdateNpc>
