// effect/Schema decoder for the terrain priority catalog (#120). A terrain is a
// surface type plus its stack priority (low→high; higher owns a shared seam) —
// the data both ground producers order their Tile Catalog against, replacing the
// priority they used to hardcode. Mirrors TerrainSerializer.call.

import * as Schema from 'effect/Schema'

export const Terrain = Schema.Struct({
  name: Schema.String,
  priority: Schema.Number,
})
export type Terrain = Schema.Schema.Type<typeof Terrain>

// The names of a terrain list ordered low→high priority — the priority argument
// the catalog builders consume.
export const priorityOrder = (terrains: readonly Terrain[]): string[] =>
  [...terrains].sort((a, b) => a.priority - b.priority).map((t) => t.name)
