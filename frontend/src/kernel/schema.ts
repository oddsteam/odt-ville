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
// above the ground. Houses/zones (ADR-0004) are later slices; this tracer
// carries only `kind: "prop"`. The art is a reference, one of two styles:
// `object_id` points at a saved tile object — the shared prop catalog
// (ADR-0008) — drawn at that object's footprint; the legacy `tileset`+`frame`
// pair addresses a spritesheet cell (the seed's fixture maps), drawn 1×1.
export const BakedEntity = Schema.Struct({
  kind: Schema.String,
  object_id: Schema.optional(Schema.Number),
  tileset: Schema.optional(Schema.String),
  frame: Schema.optional(Schema.Number),
  x: Schema.Number,
  y: Schema.Number,
  // Optional per-entity collision footprint (ADR-0004 walk-mask): a row-major
  // char grid anchored at (x,y), '#' = solid, anything else walkable. A prop has
  // none; a house/blocker contributes its solid cells to walkability *on top of*
  // the collision mask (neither overrides the other, #131). Absent on today's
  // prop-only authored maps, so optional.
  walk_mask: Schema.optional(Schema.Array(Schema.String)),
  // Optional per-entity edge mask (#53, #207): one hex digit per footprint cell
  // (row-major, anchored at (x,y)) packing the four impassable-border bits
  // (EDGE_N/E/S/W). It blocks the *border between* two otherwise-walkable cells
  // (a fence, a low wall) rather than the cell itself — finer than walk_mask.
  // Absent on today's prop-only authored maps, so optional.
  edge_mask: Schema.optional(Schema.Array(Schema.String)),
  // Optional per-entity door anchor (#29, #212): the single footprint cell that
  // is the object's entrance, as an offset from (x,y). Denormalized at bake so
  // the authored-map runtime can identify a placed building's walkable entry
  // cell (resolved cell = (x + door_dx, y + door_dy)), mirroring town.ts's
  // always-walkable door. Only a building carries one, so optional.
  door_dx: Schema.optional(Schema.Number),
  door_dy: Schema.optional(Schema.Number),
  // Ambient animation (#85): the spritesheet frames a Prop cycles (e.g. a
  // billboard) at `fps`, handled entirely by the renderer — a Prop is not a
  // Zone and never reaches the event channel. Only meaningful on tileset+frame
  // art (a catalog object is a single image). Absent = static, so optional.
  frames: Schema.optional(Schema.Array(Schema.Number)),
  fps: Schema.optional(Schema.Number),
})
export type BakedEntity = Schema.Schema.Type<typeof BakedEntity>

// One resolved layer within a baked ground cell: a concrete (tileset, frame)
// reference plus the depth it draws at. A cell can stack several — a coverage
// fill beneath a transparent edge — because the producer resolved the autotile
// here and the runtime only blits (ADR-0003). `depth` carries the terrain's
// layered-priority order so the renderer never re-derives it.
export const BakedLayer = Schema.Struct({
  tileset: Schema.String,
  frame: Schema.Number,
  depth: Schema.Number,
})
export type BakedLayer = Schema.Schema.Type<typeof BakedLayer>

// The baked ground grid produced by the Map Baker: a per-cell *stack* of
// resolved layers (autotiling already applied), row-major. An empty stack paints
// nothing. This is the autotiled counterpart to BakedMap.tiles (single flat
// cells); the runtime flattens it 1:1 with no neighbour inspection.
export const BakedGround = Schema.Struct({
  cols: Schema.Number,
  rows: Schema.Number,
  tilesets: Schema.Array(BakedTileset),
  cells: Schema.Array(Schema.Array(Schema.Array(BakedLayer))),
})
export type BakedGround = Schema.Schema.Type<typeof BakedGround>

// How a Zone fires (#85, ADR-0005): a closed enum, extended as mechanics land —
// `on_enter` steps onto the region, `on_sight` is the facing cone (#86),
// `interact` is press-to-activate while on/facing it (#110).
export const ZoneTrigger = Schema.Literal('on_enter', 'on_sight', 'interact')
export type ZoneTrigger = Schema.Schema.Type<typeof ZoneTrigger>

// What a fired Zone means, dispatched by the shell on `kind` (ADR-0005): travel
// (`portal`, #84) and an external page (`link`, #110) are the first kinds.
export const ZonePayload = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal('portal'),
    targetNode: Schema.String,
    entrySpawnId: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal('link'),
    url: Schema.String,
    label: Schema.optional(Schema.String),
  }),
)
export type ZonePayload = Schema.Schema.Type<typeof ZonePayload>

// An interactive region placed on the map (ADR-0004's third placed kind): a
// w×h tile rect anchored at (x,y) — absent w/h mean one tile — carrying how it
// fires (`trigger`) and what firing means (`payload`). Zones live apart from
// `entities` (which the decorate editor rewrites wholesale) so a decoration
// save never wipes them; a Prop stays in `entities` and never fires.
export const Zone = Schema.Struct({
  trigger: ZoneTrigger,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.optional(Schema.Number),
  h: Schema.optional(Schema.Number),
  payload: ZonePayload,
})
export type Zone = Schema.Schema.Type<typeof Zone>

export const BakedMap = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  cols: Schema.Number,
  rows: Schema.Number,
  tilesets: Schema.Array(BakedTileset),
  // Row-major grid: tiles[row][col]. A null cell paints nothing.
  tiles: Schema.Array(Schema.Array(Schema.NullOr(BakedTile))),
  entities: Schema.Array(BakedEntity),
  // An authored *painted* map carries its autotiled ground (layer stacks) here
  // instead of flat `tiles`; the runtime blits whichever the producer supplied
  // (ADR-0004 — still one shape, no per-map branching). Absent on the seed's
  // flat maps, so optional.
  ground: Schema.optional(BakedGround),
  // The collision mask (#131, CONTEXT 2026-07-03): a per-cell "blocked" grid
  // painted in the editor, row-major `collision[row][col]` sized cols×rows. It is
  // not a Placed Entity — no art, no trigger — it only vetoes walkability. The
  // runtime ANDs it into the walk rule; the editor reads it to re-paint. Absent
  // on maps with nothing masked, so optional.
  collision: Schema.optional(Schema.Array(Schema.Array(Schema.Boolean))),
  // Which producer resolved the terrain — `painted` (autotile engine) or
  // `tiled` (imported from Tiled, ADR-0007). The runtime ignores it (one render
  // path); the editor reads it to lock the paint tools for a tiled map. Absent
  // on seed/legacy maps, so optional.
  producer: Schema.optional(Schema.String),
  // Interactive zones (#85). Absent on maps that author none, so optional.
  zones: Schema.optional(Schema.Array(Zone)),
})
export type BakedMap = Schema.Schema.Type<typeof BakedMap>
