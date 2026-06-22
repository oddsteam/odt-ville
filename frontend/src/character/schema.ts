// effect/Schema decoders for the character-manifest API. `ActiveManifest`
// mirrors CharacterManifestSerializer.call (GET .../active and .../:id and the
// POST response): the roster envelope plus the free-form `data` blob the game
// renders. `ManifestSummary` mirrors the lighter index row (no data blob). The
// backend permits `data` wholesale, and normalizeManifest (manifest.js) fills
// in any missing/old fields, so we keep `data` a loose object here rather than
// re-encoding every posture/grid key. Decode failures surface as typed errors
// at the data-layer edge.

import * as Schema from 'effect/Schema'

export const ActiveManifest = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  active: Schema.Boolean,
  updated_at: Schema.String,
  data: Schema.Object,
})
export type ActiveManifest = Schema.Schema.Type<typeof ActiveManifest>

// Roster row from GET /character_manifests — index omits the (potentially
// large) `data` blob so the picker can stay light. Shape mirrors
// CharacterManifestSerializer.summary.
export const ManifestSummary = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  active: Schema.Boolean,
  updated_at: Schema.String,
})
export type ManifestSummary = Schema.Schema.Type<typeof ManifestSummary>

export const ManifestSummaryList = Schema.Array(ManifestSummary)
export type ManifestSummaryList = Schema.Schema.Type<typeof ManifestSummaryList>
