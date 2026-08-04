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
// `message` is the Placard's short line, shown over the cutout's head; `detail`
// is the longer body revealed on press-A (#372), null when only a short line
// was left. `owner_name`/`owner_avatar_url` are who left it, for the full
// Placard — the face rides the avatar proxy path (ADR-0012), null when none.
export const Standee = Schema.Struct({
  id: Schema.Number,
  x: Schema.Number,
  y: Schema.Number,
  message: Schema.String,
  detail: Schema.NullOr(Schema.String),
  // The reply link the owner supplied (#373): the campfire or thread where the
  // conversation happens, null when none. Stored raw; the shell's Placard gates
  // whether it becomes a clickable button (http(s) only).
  reply_link: Schema.NullOr(Schema.String),
  owner_name: Schema.NullOr(Schema.String),
  owner_avatar_url: Schema.NullOr(Schema.String),
  character_manifest_id: Schema.NullOr(Schema.Number),
  // Whether the caller owns this Standee (#370), resolved server-side against the
  // authenticated caller: press-A offers *pick up* on your own, *reply* on
  // someone else's — the affordance differs by who is asking, not the key.
  mine: Schema.Boolean,
})
export type Standee = Schema.Schema.Type<typeof Standee>

// Body the deploy affordance POSTs: the cell the owner is standing on, the
// Placard's short line, and its optional detail body (#372). The owner and the
// map are the caller's identity and the URL slug, so neither is in the body.
export const NewStandee = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  message: Schema.String,
  detail: Schema.optional(Schema.String),
  // The optional reply link (#373): a campfire or thread the owner pastes so
  // interested people land in one conversation, not three separate pings.
  reply_link: Schema.optional(Schema.String),
})
export type NewStandee = Schema.Schema.Type<typeof NewStandee>

// One of the caller's own Standees from GET /standees/mine — carries the map it
// stands on (slug + title) so the budget's refusal can name where each one is.
export const MyStandee = Schema.Struct({
  id: Schema.Number,
  map_slug: Schema.String,
  map_title: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  message: Schema.String,
})
export type MyStandee = Schema.Schema.Type<typeof MyStandee>

// GET /standees/mine — the world-wide budget of 3 (#371): the cap, how many are
// out, and each Standee, so the deploy affordance shows "N of 3 out" and the
// located refusal before the employee writes anything.
export const MyStandees = Schema.Struct({
  cap: Schema.Number,
  out: Schema.Number,
  standees: Schema.Array(MyStandee),
})
export type MyStandees = Schema.Schema.Type<typeof MyStandees>
