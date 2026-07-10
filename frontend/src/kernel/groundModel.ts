import { HOMETOWN_CATALOG } from './tileCatalog.ts'
import type { TileCatalog } from './tileCatalog.ts'

// The autotile rules are Tile Catalog *data* (tileCatalog.ts), not constants
// baked into this engine (ADR-0003/0004). Every resolver takes a `catalog`
// argument that defaults to the generated hometown's catalog, so the existing
// hometown render path is byte-identical, while a second producer can pass a
// catalog that introduces a new terrain with no engine change.
export { HOMETOWN_CATALOG } from './tileCatalog.ts'

// A producer-supplied terrain source: any grid exposing a `terrainAt(x, y)`
// accessor (the baker wraps its SourceMap this way; #171 removed the last
// raw-town caller, so the kernel reads no town chars). Out-of-bounds is the
// field's own concern — an authored source returns null.
export interface TerrainField {
  terrainAt(x: number, y: number): string | null
}

// Which sides of a cell a border/edge applies to, keyed by direction name
// (N/S/E/W from ORTHOGONAL_DIRS, NE/NW/SE/SW from the corner tables).
export type Borders = Record<string, boolean>

// Per-terrain side availability derived from catalog art — the shape
// edgeSetsFromCatalog / innerSetsFromCatalog (tileCatalog.ts) produce.
export type SideSets = Record<string, Record<string, boolean>>

// One paint instruction for a cell: which terrain draws, in which surface
// role, at which canonical depth. `side` only accompanies 'inner'.
export interface GroundLayer {
  terrain: string
  role: 'fill' | 'edge' | 'coverage' | 'inner'
  side?: string
  opaque: boolean
  depth: number
}

export function terrainDepth(terrain: string, catalog: TileCatalog = HOMETOWN_CATALOG): number {
  return catalog.stack.indexOf(terrain) * 0.1
}

export const ORTHOGONAL_DIRS = [
  { d: 'N', dx: 0, dy: -1 },
  { d: 'S', dx: 0, dy: 1 },
  { d: 'E', dx: 1, dy: 0 },
  { d: 'W', dx: -1, dy: 0 },
]

export const EDGE_CORNERS = [
  { c: 'NE', a: 'N', b: 'E' },
  { c: 'NW', a: 'N', b: 'W' },
  { c: 'SE', a: 'S', b: 'E' },
  { c: 'SW', a: 'S', b: 'W' },
]

// The four diagonal neighbours, for inner (concave) corners. `dx/dy` is the
// diagonal cell; the two orthogonal components are (dx,0) and (0,dy).
export const DIAGONAL_CORNERS = [
  { c: 'NE', dx: 1, dy: -1 },
  { c: 'NW', dx: -1, dy: -1 },
  { c: 'SE', dx: 1, dy: 1 },
  { c: 'SW', dx: -1, dy: 1 },
]

// A terrain's priority rank in the catalog stack; -1 for unknown/unpainted.
function rankOf(terrain: string | null, catalog: TileCatalog): number {
  return terrain === null ? -1 : catalog.stack.indexOf(terrain)
}

// Only the higher-ranked terrain owns a seam. A dirt cell therefore edges
// toward road, but remains fill toward grass; the adjacent grass cell draws the
// dirt/grass transition and reveals dirt coverage at dirt's normal depth.
export function terrainBorders(
  field: TerrainField,
  x: number,
  y: number,
  terrain: string,
  catalog: TileCatalog = HOMETOWN_CATALOG,
): Borders {
  const borders: Borders = {}
  const rank = catalog.stack.indexOf(terrain)
  for (const { d, dx, dy } of ORTHOGONAL_DIRS) {
    const neighbourRank = rankOf(field.terrainAt(x + dx, y + dy), catalog)
    borders[d] = neighbourRank >= 0 && neighbourRank < rank
  }
  return borders
}

// A transparent edge needs an opaque terrain fill in its own cell. If several
// different neighbours meet there, the highest terrain in the catalog stack
// wins. The painter stamps this choice at the backing terrain's canonical
// depth; sub-tile, per-side backing is out of scope.
export function coverageTerrainForCell(
  field: TerrainField,
  x: number,
  y: number,
  terrain: string,
  borders: Borders | null = null,
  catalog: TileCatalog = HOMETOWN_CATALOG,
): string | null {
  const neighbours = new Set<string>()
  const rank = catalog.stack.indexOf(terrain)
  for (const { d, dx, dy } of ORTHOGONAL_DIRS) {
    if (borders && !borders[d]) continue
    const neighbour = field.terrainAt(x + dx, y + dy)
    if (neighbour === null) continue
    const neighbourRank = catalog.stack.indexOf(neighbour)
    if (neighbourRank >= 0 && neighbourRank < rank) neighbours.add(neighbour)
  }
  return catalog.stack.findLast((candidate) => neighbours.has(candidate)) || null
}

// Inner (concave) corners this terrain wraps: a diagonal neighbour is lower
// priority while *neither* orthogonal side facing it is (both are the same or a
// higher terrain), so the terrain bends around the lower cell's convex corner.
// Returns one `{ side, terrain }` per such diagonal — `terrain` is the diagonal
// neighbour that shows through the concave notch. This is the counterpart to
// `terrainBorders`' straight/outer-corner ownership (see #119).
export function terrainInnerCorners(
  field: TerrainField,
  x: number,
  y: number,
  terrain: string,
  catalog: TileCatalog = HOMETOWN_CATALOG,
): Array<{ side: string; terrain: string }> {
  const rank = catalog.stack.indexOf(terrain)
  if (rank < 0) return []
  const lower = (nx: number, ny: number) => {
    const r = rankOf(field.terrainAt(nx, ny), catalog)
    return r >= 0 && r < rank
  }
  const out: Array<{ side: string; terrain: string }> = []
  for (const { c, dx, dy } of DIAGONAL_CORNERS) {
    const diagonal = field.terrainAt(x + dx, y + dy)
    if (diagonal !== null && lower(x + dx, y + dy) && !lower(x + dx, y) && !lower(x, y + dy)) {
      out.push({ side: c, terrain: diagonal })
    }
  }
  return out
}

export function groundPaintStackForCell(
  field: TerrainField,
  x: number,
  y: number,
  edgeSets: SideSets | null = null,
  catalog: TileCatalog = HOMETOWN_CATALOG,
  innerSets: SideSets | null = null,
): GroundLayer[] {
  const terrain = field.terrainAt(x, y)
  if (!terrain) return []
  const borders = terrainBorders(field, x, y, terrain, catalog)
  const edgeSet = edgeSets?.[terrain]
  const hasCatalogEdge =
    edgeSet &&
    (EDGE_CORNERS.some(({ c, a, b }) => borders[a] && borders[b] && edgeSet[c]) ||
      ORTHOGONAL_DIRS.some(({ d }) => borders[d] && edgeSet[d]))
  const isTransparentEdge = edgeSets
    ? Boolean(hasCatalogEdge)
    : catalog.autotiled.has(terrain) && Object.values(borders).some(Boolean)

  // Concave corners only autotile where the catalog carries inner-corner art for
  // this terrain + side (data-gated exactly like edges); other terrains bake as
  // today with no inner tile — the graceful fallback.
  const innerSet = innerSets?.[terrain]
  const inners = innerSet
    ? terrainInnerCorners(field, x, y, terrain, catalog).filter((ic) => innerSet[ic.side])
    : []

  const depth = terrainDepth(terrain, catalog)
  const layers: GroundLayer[] = []
  if (isTransparentEdge) {
    const backing = coverageTerrainForCell(field, x, y, terrain, borders, catalog)
    if (backing) {
      layers.push({ terrain: backing, role: 'coverage', opaque: true, depth: terrainDepth(backing, catalog) })
    }
    layers.push({ terrain, role: 'edge', opaque: false, depth })
  } else if (inners.length === 0) {
    // A pure fill cell with a concave corner is NOT a flat fill — the fill would
    // paint over the notch. Its coverage + inner tiles below carry the cell.
    layers.push({ terrain, role: 'fill', opaque: true, depth })
  }
  // Each inner corner: the diagonal terrain as opaque coverage beneath a
  // transparent-notched inner-corner tile, so the concave seam reveals it.
  for (const ic of inners) {
    layers.push({ terrain: ic.terrain, role: 'coverage', opaque: true, depth: terrainDepth(ic.terrain, catalog) })
    layers.push({ terrain, role: 'inner', side: ic.side, opaque: false, depth })
  }
  return layers
}

// Road is the bottom layer, so its base extends one cell in every direction
// beneath neighbouring higher terrain. Diagonal cells are included to keep
// caps and corners covered even though edge ownership is orthogonal.
export function roadLayerCoversCell(town: TerrainField, x: number, y: number): boolean {
  if (town.terrainAt(x, y) === 'road') return true
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      if (town.terrainAt(x + dx, y + dy) === 'road') return true
    }
  }
  return false
}

// Dirt's lower-layer coverage is a one-cell mask beneath neighbouring grass.
// It does not change the logical/top terrain: grass still paints above it, and
// roads are never absorbed into the dirt mask.
export function dirtLayerCoversCell(town: TerrainField, x: number, y: number): boolean {
  const terrain = town.terrainAt(x, y)
  if (terrain === 'dirt') return true
  if (terrain !== 'grass') return false

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      if (town.terrainAt(x + dx, y + dy) === 'dirt') return true
    }
  }
  return false
}

export function dirtLayerBorders(town: TerrainField, x: number, y: number): Borders {
  const borders: Borders = {}
  for (const { d, dx, dy } of ORTHOGONAL_DIRS) {
    borders[d] = !dirtLayerCoversCell(town, x + dx, y + dy)
  }
  return borders
}

export function dirtLayerTileForCell(
  town: TerrainField,
  x: number,
  y: number,
): { role: 'corner' | 'edge' | 'fill'; side: string | null } | null {
  if (!dirtLayerCoversCell(town, x, y)) return null
  const borders = dirtLayerBorders(town, x, y)
  const corner = EDGE_CORNERS.find(({ a, b }) => borders[a] && borders[b])
  if (corner) return { role: 'corner', side: corner.c }
  const edge = ORTHOGONAL_DIRS.find(({ d }) => borders[d])
  if (edge) return { role: 'edge', side: edge.d }
  return { role: 'fill', side: null }
}
