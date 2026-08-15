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
  // Authored impassable cell borders for a 'building' (issue #53): a row-major
  // grid the size of the footprint, one hex digit per cell whose bits mark
  // blocked sides (N=1 E=2 S=4 W=8). Null otherwise.
  edge_mask: Schema.NullOr(Schema.Array(Schema.String)),
  // Animated art (#435, ADR-0019): `image` is a horizontal frame strip when
  // frame_count > 1 (1 = today's still object). Frame size is derived from the
  // image — imageWidth / frame_count × imageHeight — never authored. `fps` null
  // lets the runtime pick; `playback` is 'loop' or 'proximity'.
  frame_count: Schema.Number,
  fps: Schema.NullOr(Schema.Number),
  playback: Schema.String,
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

// The editor-only composition (#355, ADR-0014) — the rebuild note beside the
// art: which tileset (`ts`, registry name), which flat tile index (`i`), which
// composition cell (`c,r`), which layer. Read only by the tile-object mapper to
// reopen and remix a composed object; the game never sees it. Mirrors the pure
// shape in tileMapper/composition.ts.
export const Composition = Schema.Struct({
  v: Schema.Literal(1),
  cell: Schema.Number,
  cols: Schema.Number,
  rows: Schema.Number,
  layers: Schema.Array(
    Schema.Struct({
      tiles: Schema.Array(
        Schema.Struct({ c: Schema.Number, r: Schema.Number, ts: Schema.String, i: Schema.Number }),
      ),
    }),
  ),
})
export type Composition = Schema.Schema.Type<typeof Composition>

// The object as returned by `show` alone — the full object plus its composition,
// so the mapper can reopen it. `{}` (no composition: every cropped/uploaded
// object, plus everything composed before #355) decodes to the empty struct and
// the mapper treats it as flat art. Kept off the shared `TileObject` (the game's
// batched/active reads) so the roster and play paths stay lean.
export const TileObjectDetail = Schema.Struct({
  ...TileObject.fields,
  composition: Schema.optional(Schema.Union(Composition, Schema.Struct({}))),
})
export type TileObjectDetail = Schema.Schema.Type<typeof TileObjectDetail>

// Body the mapper POSTs to save a tile object. Echoes the controller's permit
// list (name / kind / image / footprint_w / footprint_h); the service adds
// `active: true`.
export const NewTileObject = Schema.Struct({
  name: Schema.String,
  kind: Schema.String,
  image: Schema.String,
  footprint_w: Schema.Number,
  footprint_h: Schema.Number,
  // Door cell, only sent for 'building' objects (issue #29). An explicit null
  // clears a saved door — absent keys keep the server's stored value.
  door_dx: Schema.optional(Schema.NullOr(Schema.Number)),
  door_dy: Schema.optional(Schema.NullOr(Schema.Number)),
  // Interior walk mask, only sent for 'building' objects (issue #32).
  walk_mask: Schema.optional(Schema.Array(Schema.String)),
  // Impassable cell borders, only sent for 'building' objects (issue #53).
  edge_mask: Schema.optional(Schema.Array(Schema.String)),
  // Foreground mask, only sent for 'building' objects (issue #36).
  fg_mask: Schema.optional(Schema.String),
  // Editor-only composition (#355) — sent whenever the art was composed from
  // tiles, so the object can be reopened and remixed. Absent for the upload
  // path and for flat re-saves, which keeps the server's stored value.
  composition: Schema.optional(Composition),
})
export type NewTileObject = Schema.Schema.Type<typeof NewTileObject>
