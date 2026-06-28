// effect/Schema decoders for the tile-object API. Mirrors TileObjectSerializer
// (`call` = the full object with the image data URL the game draws). Decode
// failures surface as typed errors at the data-layer edge. `kind` is a
// free-form string on the backend (presence-validated only), so we keep it a
// String here rather than a Literal.

import * as Schema from 'effect/Schema'

// Roster row from GET /tile_objects (the `summary` serializer): everything but
// the heavy image blob. The mapper's saved-objects list renders these.
export const TileObjectSummary = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  kind: Schema.String,
  footprint_w: Schema.Number,
  footprint_h: Schema.Number,
  // Authored door cell for a 'building' object (issue #29); null otherwise.
  door_dx: Schema.NullOr(Schema.Number),
  door_dy: Schema.NullOr(Schema.Number),
  // Authored interior walk mask for a 'building' (issue #32): a row-major grid
  // the size of the footprint, '#' = solid, '.' = walkable. Null otherwise.
  walk_mask: Schema.NullOr(Schema.Array(Schema.String)),
  active: Schema.Boolean,
  updated_at: Schema.String,
})
export type TileObjectSummary = Schema.Schema.Type<typeof TileObjectSummary>

// The full object the game draws — a summary plus the image data URL and the
// optional foreground mask (#36): a PNG data URL marking which house pixels
// render over the avatar. Null for non-buildings / buildings without foliage.
export const TileObject = Schema.Struct({
  ...TileObjectSummary.fields,
  image: Schema.String,
  fg_mask: Schema.NullOr(Schema.String),
})
export type TileObject = Schema.Schema.Type<typeof TileObject>

// Body the mapper POSTs to save a tile object. Echoes the controller's permit
// list (name / kind / image / footprint_w / footprint_h); the service adds
// `active: true`.
export const NewTileObject = Schema.Struct({
  name: Schema.String,
  kind: Schema.String,
  image: Schema.String,
  footprint_w: Schema.Number,
  footprint_h: Schema.Number,
  // Door cell, only sent for 'building' objects (issue #29).
  door_dx: Schema.optional(Schema.Number),
  door_dy: Schema.optional(Schema.Number),
  // Interior walk mask, only sent for 'building' objects (issue #32).
  walk_mask: Schema.optional(Schema.Array(Schema.String)),
  // Foreground mask, only sent for 'building' objects (issue #36).
  fg_mask: Schema.optional(Schema.String),
})
export type NewTileObject = Schema.Schema.Type<typeof NewTileObject>
