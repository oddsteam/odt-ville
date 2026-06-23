import { tileChar, typeForTileChar } from '../town.ts'
export { typeForTileChar } from '../town.ts'

export const GROUND_STACK = ['road', 'dirt', 'grass']
export const AUTOTILED_TERRAINS = new Set(['grass', 'dirt'])

export function terrainDepth(terrain) {
  return GROUND_STACK.indexOf(terrain) * 0.1
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

function terrainForCell(town, x, y) {
  return typeForTileChar(tileChar(town, x, y))
}

// Only the higher-ranked terrain owns a seam. A dirt cell therefore edges
// toward road, but remains fill toward grass; the adjacent grass cell draws the
// dirt/grass transition and reveals dirt coverage at dirt's normal depth.
export function terrainBorders(town, x, y, terrain) {
  const borders = {}
  const rank = GROUND_STACK.indexOf(terrain)
  for (const { d, dx, dy } of ORTHOGONAL_DIRS) {
    const neighbour = terrainForCell(town, x + dx, y + dy)
    const neighbourRank = GROUND_STACK.indexOf(neighbour)
    borders[d] = neighbourRank >= 0 && neighbourRank < rank
  }
  return borders
}

// A transparent edge needs an opaque terrain fill in its own cell. If several
// different neighbours meet there, the highest terrain in GROUND_STACK wins.
// The painter stamps this choice at the backing terrain's canonical depth;
// sub-tile, per-side backing is out of scope.
export function coverageTerrainForCell(town, x, y, terrain, borders = null) {
  const neighbours = new Set()
  const rank = GROUND_STACK.indexOf(terrain)
  for (const { d, dx, dy } of ORTHOGONAL_DIRS) {
    if (borders && !borders[d]) continue
    const neighbour = terrainForCell(town, x + dx, y + dy)
    const neighbourRank = GROUND_STACK.indexOf(neighbour)
    if (neighbourRank >= 0 && neighbourRank < rank) neighbours.add(neighbour)
  }
  return GROUND_STACK.findLast((candidate) => neighbours.has(candidate)) || null
}

export function groundPaintStackForCell(town, x, y, edgeSets = null) {
  const terrain = terrainForCell(town, x, y)
  if (!terrain) return []
  const borders = terrainBorders(town, x, y, terrain)
  const edgeSet = edgeSets?.[terrain]
  const hasCatalogEdge =
    edgeSet &&
    (EDGE_CORNERS.some(({ c, a, b }) => borders[a] && borders[b] && edgeSet[c]) ||
      ORTHOGONAL_DIRS.some(({ d }) => borders[d] && edgeSet[d]))
  const isTransparentEdge = edgeSets
    ? Boolean(hasCatalogEdge)
    : AUTOTILED_TERRAINS.has(terrain) && Object.values(borders).some(Boolean)

  if (!isTransparentEdge) {
    return [{ terrain, role: 'fill', opaque: true, depth: terrainDepth(terrain) }]
  }
  const backing = coverageTerrainForCell(town, x, y, terrain, borders)
  return [
    ...(backing
      ? [{ terrain: backing, role: 'coverage', opaque: true, depth: terrainDepth(backing) }]
      : []),
    { terrain, role: 'edge', opaque: false, depth: terrainDepth(terrain) },
  ]
}

// Road is the bottom layer, so its base extends one cell in every direction
// beneath neighbouring higher terrain. Diagonal cells are included to keep
// caps and corners covered even though edge ownership is orthogonal.
export function roadLayerCoversCell(town, x, y) {
  if (terrainForCell(town, x, y) === 'road') return true
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      if (terrainForCell(town, x + dx, y + dy) === 'road') return true
    }
  }
  return false
}

// Dirt's lower-layer coverage is a one-cell mask beneath neighbouring grass.
// It does not change the logical/top terrain: grass still paints above it, and
// roads are never absorbed into the dirt mask.
export function dirtLayerCoversCell(town, x, y) {
  const terrain = terrainForCell(town, x, y)
  if (terrain === 'dirt') return true
  if (terrain !== 'grass') return false

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      if (terrainForCell(town, x + dx, y + dy) === 'dirt') return true
    }
  }
  return false
}

export function dirtLayerBorders(town, x, y) {
  const borders = {}
  for (const { d, dx, dy } of ORTHOGONAL_DIRS) {
    borders[d] = !dirtLayerCoversCell(town, x + dx, y + dy)
  }
  return borders
}

export function dirtLayerTileForCell(town, x, y) {
  if (!dirtLayerCoversCell(town, x, y)) return null
  const borders = dirtLayerBorders(town, x, y)
  const corner = EDGE_CORNERS.find(({ a, b }) => borders[a] && borders[b])
  if (corner) return { role: 'corner', side: corner.c }
  const edge = ORTHOGONAL_DIRS.find(({ d }) => borders[d])
  if (edge) return { role: 'edge', side: edge.d }
  return { role: 'fill', side: null }
}
