// effect/Schema decoder for the village-game session resource. Mirrors
// GameSessionSerializer (GET/PUT /api/v1/game/session): the coarse last
// location plus the derived `spawn` the game uses to drop the avatar. Decode
// failures surface as typed errors at the data-layer edge.

import * as Schema from 'effect/Schema'

// Matches UserLocationState#last_area (town | house). The DB column is still
// `last_house_id`; the wire exposes it as `last_community_id` (number | null).
export const Area = Schema.Literal('town', 'house')

export const GameSession = Schema.Struct({
  last_area: Area,
  last_community_id: Schema.NullOr(Schema.Number),
  last_room: Schema.NullOr(Schema.String),
  // The serializer hard-codes area: "town"; mirror it exactly.
  spawn: Schema.Struct({
    area: Schema.Literal('town'),
    last_community_id: Schema.NullOr(Schema.Number),
  }),
})
export type GameSession = Schema.Schema.Type<typeof GameSession>

// Body the page PUTs to save the session. Echoes the controller's permit list
// (area / last_community / last_room — never x/y). All optional: callers send
// just the fields a given transition changes.
export const GameSessionUpdate = Schema.Struct({
  last_area: Schema.optional(Area),
  last_community_id: Schema.optional(Schema.NullOr(Schema.Number)),
  last_room: Schema.optional(Schema.NullOr(Schema.String)),
})
export type GameSessionUpdate = Schema.Schema.Type<typeof GameSessionUpdate>
