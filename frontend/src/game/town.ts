// Pure town geometry and terrain helpers. Keeping these free of image imports
// lets the generator invariants run in Node without booting Vite or Phaser.

export interface Plot {
  col: number
  row: number
  w: number
  h: number
  doorCol: number
  doorRow: number
}

// Just the tile grid — all the terrain/walkability reads need. A full `Town`
// (or any test double with these three fields) satisfies it.
export interface TileGrid {
  cols: number
  rows: number
  map: string[]
}

export interface Town extends TileGrid {
  plots: Plot[]
  entrance: { x: number; y: number }
}

// A placed building footprint. The renderer adds sprite/community fields; the
// walkability rule only needs the footprint box + door cell.
export interface Building {
  col: number
  row: number
  w: number
  h: number
  doorCol: number
  doorRow: number
}

export const PER_ROW = 5 // buildings per street row
const BAND_H = 7 // per row band: 4 building + 1 street-path + 2 grass gap
const TOP_MARGIN = 2 // grass rows above the first building row
const BOTTOM_MARGIN = 2 // grass rows below the last street, before the gate
const FIELD_GAP = 0 // field starts right after the band's own grass rows
const FIELD_H = 7 // height of the tall-grass field block (wild encounters)

// Build the whole town for a given number of building plots. Returns a `town`
// object: { cols, rows, map (string[]), plots, entrance }.
export function buildTown(plotCount: number): Town {
  const count = Math.max(plotCount, 1)
  const numRows = Math.ceil(count / PER_ROW)
  const colsUsed = Math.max(Math.min(count, PER_ROW), 3)
  const cols = 4 * colsUsed + 4
  const rows =
    1 + TOP_MARGIN + numRows * BAND_H + FIELD_GAP + FIELD_H + BOTTOM_MARGIN + 1

  // Each plot: 3 wide x 4 tall; door is the bottom-centre tile.
  // The first plots (by position_order) sit on the bottom-most building row.
  const plots: Plot[] = []
  for (let i = 0; i < count; i++) {
    const slot = i % PER_ROW
    const r = Math.floor(i / PER_ROW)
    const col = 2 + slot * 4
    const row = 1 + TOP_MARGIN + (numRows - 1 - r) * BAND_H
    plots.push({ col, row, w: 3, h: 4, doorCol: col + 1, doorRow: row + 3 })
  }

  const streetPathRows = new Set<number>()
  const buildingRows = new Set<number>()
  for (let r = 0; r < numRows; r++) {
    const top = 1 + TOP_MARGIN + r * BAND_H
    streetPathRows.add(top + 4)
    for (let k = 0; k < 4; k++) buildingRows.add(top + k)
  }
  const lastStreetPath = 1 + TOP_MARGIN + (numRows - 1) * BAND_H + 4
  const entranceCol = Math.floor(cols / 2)

  const fieldTop = 1 + TOP_MARGIN + numRows * BAND_H + FIELD_GAP
  const fieldBottom = fieldTop + FIELD_H - 1
  // Two grass cells separate the avenue from the dirt field. This is the
  // minimum margin that prevents an autotiled grass cell from having road and
  // dirt on opposite orthogonal sides.
  const fieldLeft = 4
  const fieldRight = cols - 3

  function tileFor(x: number, y: number): string {
    if (y === 0) return 'T'
    if (y === rows - 1) return x === entranceCol ? ':' : 'T'
    if (x === 0 || x === cols - 1) return 'T'
    if (streetPathRows.has(y)) return ':'
    if (x === 1) return ':'
    if (x === entranceCol && y >= lastStreetPath) return ':'
    if (y >= fieldTop && y <= fieldBottom && x >= fieldLeft && x <= fieldRight)
      return 'g'
    if (y === rows - 2 && x === entranceCol - 1) return 's'
    if (!buildingRows.has(y) && flowerAt(x, y)) return '*'
    return '.'
  }

  const map: string[] = []
  for (let y = 0; y < rows; y++) {
    let row = ''
    for (let x = 0; x < cols; x++) row += tileFor(x, y)
    map.push(row)
  }

  return { cols, rows, map, plots, entrance: { x: entranceCol, y: rows - 2 } }
}

// Tile classes that block movement on their own (independent of buildings):
// boundary trees and the signpost. Anything else is walkable ground.
export const BLOCKED_TILE_CHARS = new Set(['T', 's'])

const WALKABLE = new Set(['.', ':', '*', 'g'])

export function tileChar(town: TileGrid, x: number, y: number): string {
  if (y < 0 || y >= town.rows || x < 0 || x >= town.cols) return 'T'
  return town.map[y][x]
}

export function typeForTileChar(ch: string): 'grass' | 'dirt' | 'road' | null {
  switch (ch) {
    case '.':
    case '*':
    case 'T':
    case 's':
      return 'grass'
    case 'g':
      return 'dirt'
    case ':':
      return 'road'
    default:
      return null
  }
}

export function isGroundWalkable(town: TileGrid, x: number, y: number): boolean {
  return WALKABLE.has(tileChar(town, x, y))
}

// Coherent flower scatter. A deterministic value-noise field (smooth hash,
// bilinearly interpolated) thresholded into patches: nearby tiles share similar
// noise, so flowers clump; a little per-tile jitter ragged-edges the patches and
// sprinkles outliers. Pure + seeded (no Math.random) so the map is stable and
// Node-testable. Replaces the old (x*5+y*3)%11 lattice that striped the grass.
const FLOWER_SEED = 1337
const FLOWER_CELL = 4 // noise grid size in tiles — bigger = larger patches
const FLOWER_THRESHOLD = 0.62
const FLOWER_JITTER = 0.18 // ragged edges + outliers

// 32-bit integer hash → [0,1). Math.imul keeps the multiplies exact (and so
// deterministic across platforms), unlike float-rounded `*`.
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function valueNoise(x: number, y: number): number {
  const gx = Math.floor(x / FLOWER_CELL)
  const gy = Math.floor(y / FLOWER_CELL)
  const fx = x / FLOWER_CELL - gx
  const fy = y / FLOWER_CELL - gy
  // smoothstep the cell fractions so patch edges aren't linearly faceted
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = hash2(gx, gy, FLOWER_SEED)
  const n10 = hash2(gx + 1, gy, FLOWER_SEED)
  const n01 = hash2(gx, gy + 1, FLOWER_SEED)
  const n11 = hash2(gx + 1, gy + 1, FLOWER_SEED)
  const a = n00 + (n10 - n00) * sx
  const b = n01 + (n11 - n01) * sx
  return a + (b - a) * sy
}

export function flowerAt(x: number, y: number): boolean {
  const jitter = (hash2(x, y, FLOWER_SEED ^ 0x9e37) - 0.5) * FLOWER_JITTER
  return valueNoise(x, y) + jitter > FLOWER_THRESHOLD
}

// Player render depth at a tile. On a building's door tile, beat that building's
// sprite depth ((row+h)*10 - 1 in townRenderer) so the avatar reads as standing
// in the doorway instead of clipping under it; elsewhere, the row-banded default.
export function playerDepthAt(buildings: Building[], x: number, y: number): number {
  const door = buildings.find((b) => b.doorCol === x && b.doorRow === y)
  return door ? (door.row + door.h) * 10 : y * 10 + 5
}

// Authoritative town walkability rule, pure and Node-runnable. Out-of-bounds
// and blocked tile classes (tree/sign) block; doors are always walkable (the
// way into a house); a building footprint blocks; `blockers` is the scene's
// set of dynamic "x,y" cells — tall props plus the gate-trainer tile.
export function isWalkable(
  town: TileGrid,
  buildings: Building[],
  blockers: Set<string>,
  x: number,
  y: number,
): boolean {
  if (BLOCKED_TILE_CHARS.has(tileChar(town, x, y))) return false
  if (buildings.some((b) => b.doorCol === x && b.doorRow === y)) return true
  if (buildings.some((b) => x >= b.col && x < b.col + b.w && y >= b.row && y < b.row + b.h)) {
    return false
  }
  return !blockers.has(`${x},${y}`)
}
