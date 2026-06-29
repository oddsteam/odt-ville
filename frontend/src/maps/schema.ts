// effect/Schema decoders for a baked authored map (ADR-0004 runtime shape,
// ADR-0003 baked-not-resolved). Mirrors MapSerializer.call: identity (slug /
// title / size) plus the baked artifact the game blits — a concrete tile grid
// and a flat entity list. There is no terrain/autotile data here on purpose;
// the producer already resolved it, so the runtime never re-tiles.

import * as Schema from 'effect/Schema'

// A tileset the baked tiles reference. `cell` is px per tile, so the runtime
// can load the PNG as a uniform spritesheet and address a cell by frame index.
export const BakedTileset = Schema.Struct({
  name: Schema.String,
  cell: Schema.Number,
})
export type BakedTileset = Schema.Schema.Type<typeof BakedTileset>

// One baked ground cell: a concrete (tileset, frame) reference, already
// resolved. `null` is a transparent cell (nothing painted there).
export const BakedTile = Schema.Struct({
  tileset: Schema.String,
  frame: Schema.Number,
})
export type BakedTile = Schema.Schema.Type<typeof BakedTile>

// A placed entity — a decorative prop for now. Stamped at a tile coordinate
// from a tileset cell, above the ground. Houses/zones (ADR-0004) are later
// slices; this tracer carries only `kind: "prop"`.
export const BakedEntity = Schema.Struct({
  kind: Schema.String,
  tileset: Schema.String,
  frame: Schema.Number,
  x: Schema.Number,
  y: Schema.Number,
})
export type BakedEntity = Schema.Schema.Type<typeof BakedEntity>

export const BakedMap = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  cols: Schema.Number,
  rows: Schema.Number,
  tilesets: Schema.Array(BakedTileset),
  // Row-major grid: tiles[row][col]. A null cell paints nothing.
  tiles: Schema.Array(Schema.Array(Schema.NullOr(BakedTile))),
  entities: Schema.Array(BakedEntity),
})
export type BakedMap = Schema.Schema.Type<typeof BakedMap>
