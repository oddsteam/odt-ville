// effect/Schema decoders for the tile-object API. Mirrors TileObjectSerializer
// (`call` = the full object with the image data URL the game draws). Decode
// failures surface as typed errors at the data-layer edge. `kind` is a
// free-form string on the backend (presence-validated only), so we keep it a
// String here rather than a Literal.

import * as Schema from 'effect/Schema'

export const TileObject = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  kind: Schema.String,
  footprint_w: Schema.Number,
  footprint_h: Schema.Number,
  active: Schema.Boolean,
  updated_at: Schema.String,
  image: Schema.String,
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
})
export type NewTileObject = Schema.Schema.Type<typeof NewTileObject>
