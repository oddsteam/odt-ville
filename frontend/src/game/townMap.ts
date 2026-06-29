// Town producer — emits the runtime map shape (ADR-0004) for the generated
// hometown, delegating ground-tile resolution to the SHARED autotile engine
// (the Map Baker, src/maps/baker.ts) exactly as the authored-map producer does.
//
// This is the convergence of #81: before, the hometown's ground was autotiled at
// render time inside townRenderer; now the resolution runs once, here in the
// producer (ADR-0003), and the runtime only blits the baked result. `town.ts`
// keeps generation + terrain classification but owns no seam resolution — that
// is the engine's, shared with every other producer. Pure and Phaser-free.

import { buildTown, tileChar, typeForTileChar } from './town.ts'
import type { DoorAnchor, Footprint, Town } from './town.ts'
import { bakeGround } from '../maps/baker.ts'
import type { SourceMap } from '../maps/baker.ts'
import { HOMETOWN_CATALOG } from './phaser/tileCatalog.ts'
import type { TileCatalog } from './phaser/tileCatalog.ts'
import type { BakedGround } from '../maps/schema.ts'

// Present the generated town as a *source document* — the same painted-terrain
// shape an authored map saves — so both producers feed ONE engine. Each cell's
// terrain is the town's char→terrain classification; a char with no terrain
// (none in the hometown today) is unpainted (null) and bakes to nothing.
export function townTerrainSource(town: Town): SourceMap {
  const terrain: Array<Array<string | null>> = []
  for (let y = 0; y < town.rows; y++) {
    const row: Array<string | null> = []
    for (let x = 0; x < town.cols; x++) row.push(typeForTileChar(tileChar(town, x, y)))
    terrain.push(row)
  }
  return { slug: 'hometown', title: 'Hometown', cols: town.cols, rows: town.rows, terrain }
}

// Bake the town's ground through the shared engine. Identical terrain resolves
// to identical baked tiles whether it came from `buildTown` or an authored
// document, because this is the very same `bakeGround` (ADR-0003/0004).
export function bakeTownGround(town: Town, catalog: TileCatalog = HOMETOWN_CATALOG): BakedGround {
  return bakeGround(townTerrainSource(town), catalog)
}

// The runtime map shape the generated hometown emits (ADR-0004): the town
// geometry the navigation / interaction layers read (plots, entrance, walk
// masks), plus the producer-baked ground the renderer blits with no autotiling.
export interface TownMap extends Town {
  ground: BakedGround
}

// One producer call: generate the layout (town.ts) and bake its ground (shared
// engine). The geometry fields are byte-identical to `buildTown` — the golden
// hometown net pins them — with the baked runtime ground added alongside.
export function buildTownMap(
  plotCount: number,
  door?: DoorAnchor,
  footprint?: Footprint,
  walkMask?: string[],
  edgeMask?: string[],
  catalog: TileCatalog = HOMETOWN_CATALOG,
): TownMap {
  const town = buildTown(plotCount, door, footprint, walkMask, edgeMask)
  return { ...town, ground: bakeTownGround(town, catalog) }
}
