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
  active: Schema.Boolean,
  updated_at: Schema.String,
})
export type TileObjectSummary = Schema.Schema.Type<typeof TileObjectSummary>

// The full object the game draws — a summary plus the image data URL.
export const TileObject = Schema.Struct({ ...TileObjectSummary.fields, image: Schema.String })
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
})
export type NewTileObject = Schema.Schema.Type<typeof NewTileObject>
