// effect/Schema decoders for the ground-tile catalog. Mirrors
// GroundTileSerializer.call — a tile is its atlas coordinate (tileset/col/row)
// plus surface metadata, never an image blob. `side` is null for fill tiles
// and a direction string for edge/corner tiles. Decode failures surface as
// typed errors at the data-layer edge.

import * as Schema from 'effect/Schema'

export const GroundTile = Schema.Struct({
  id: Schema.Number,
  tile_type: Schema.String,
  tileset: Schema.String,
  col: Schema.Number,
  row: Schema.Number,
  cell: Schema.Number,
  label: Schema.String,
  role: Schema.String,
  side: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
})
export type GroundTile = Schema.Schema.Type<typeof GroundTile>

// Body the mapper POSTs to tag a cell. Echoes the controller's permit list;
// the service passes it straight through (the backend upserts by tileset/col/row).
export const NewGroundTile = Schema.Struct({
  tile_type: Schema.String,
  tileset: Schema.String,
  col: Schema.Number,
  row: Schema.Number,
  cell: Schema.Number,
  label: Schema.String,
  role: Schema.String,
  side: Schema.NullOr(Schema.String),
})
export type NewGroundTile = Schema.Schema.Type<typeof NewGroundTile>
