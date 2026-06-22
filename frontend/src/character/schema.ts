// effect/Schema decoder for the character-manifest API. Mirrors
// CharacterManifestSerializer.call (GET /character_manifests/active): the
// roster envelope plus the free-form `data` blob the game renders. The backend
// permits `data` wholesale, and normalizeManifest (manifest.js) fills in any
// missing/old fields, so we keep `data` a loose object here rather than
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
