// effect/Schema decoders for the Standees API (#369, ADR-0015). A Standee is a
// peer-to-peer cutout read alongside a map — never baked into the map document.
// Mirrors StandeeSerializer: the cell rides as `x`/`y` (the tile-coordinate
// shape the map's placed entities use) and the rig is a *reference*
// (`character_manifest_id`, resolved from the owner), never a copied manifest.
// Decode failures surface as typed errors at the data edge.

import * as Schema from 'effect/Schema'

// A Standee from GET /maps/:slug/standees. `character_manifest_id` names the
// owner's rig (their pick, else the global active); null when the owner has no
// manifest — the runtime draws the bundled fallback rather than crashing.
// `message` is the Placard's short line, shown over the cutout's head.
export const Standee = Schema.Struct({
  id: Schema.Number,
  x: Schema.Number,
  y: Schema.Number,
  message: Schema.String,
  character_manifest_id: Schema.NullOr(Schema.Number),
})
export type Standee = Schema.Schema.Type<typeof Standee>

// Body the deploy affordance POSTs: the cell the owner is standing on plus the
// Placard's short line. The owner and the map are the caller's identity and the
// URL slug, so neither is in the body.
export const NewStandee = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  message: Schema.String,
})
export type NewStandee = Schema.Schema.Type<typeof NewStandee>
