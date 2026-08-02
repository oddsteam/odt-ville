// Pure town geometry and terrain helpers. Keeping these free of image imports
// lets the generator invariants run in Node without booting Vite or Phaser.

import { maskCharWalkable, walkMaskConnected, EDGE_N, EDGE_E, EDGE_S, EDGE_W } from '../kernel/walkMask.ts'
import type { Zone } from '../kernel/schema.ts'

export interface Plot {
  col: number
  row: number
  w: number
  h: number
  doorCol: number
  doorRow: number
  mask?: string[]
  edges?: string[]
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
  entities: PlacedEntity[]
  // The generated producer's interactive regions (#255): the same Zone shape
  // an authored map carries, computed here instead of placed by hand — the
  // tall-grass encounter field and the gate trainer's sight cone.
  zones: Zone[]
}

// A placed-entity reference (ADR-0008): the shape both producers emit, resolved
// to pixels by the shared entity loader. The town's foliage now rides it too.
export interface PlacedEntity {
  kind: 'prop'
  object_id: number
  x: number
  y: number
}

// The resolved Hometown Policy the generator reads (CONTEXT.md 2026-07-07,
// #173): the active catalog object per foliage kind, already fetched by the
// shell's single resolution point. Structural — a full TileObject satisfies
// each role. A null role places nothing (there is no bundled fallback art;
// like a dangling reference, nothing renders). `building` stays bespoke until
// the House slice (#90).
export interface HometownPolicy {
  tree: { id: number; footprint_w?: number | null; footprint_h?: number | null } | null
  flowerGroup: { id: number; footprint_w?: number | null; footprint_h?: number | null } | null
  flowerSingle: { id: number } | null
  // The wild-encounter pool the tall-grass field rolls (#255): a pool slug for
  // the field zone's `encounter` payload; absent/'' names the whole global pool.
  wildPool?: string | null
  // The gate trainer's Catalog::Npc row (#259/#255), referenced by the trainer
  // zone's payload; absent → the unset sentinel 0 (the village shell falls back
  // to the bundled gate trainer so the gate is never unguarded).
  gateNpcId?: number | null
}

// A placed building footprint. The renderer adds sprite/community fields; the
// walkability rule only needs the footprint box + door cell + optional walk
// mask (#32) marking which interior cells the avatar may stand on.
export interface Building {
  col: number
  row: number
  w: number
  h: number
  doorCol: number
  doorRow: number
  mask?: string[]
  // Authored impassable cell borders (#53): a row-major grid sized to the
  // footprint, one hex digit per cell whose bits mark which sides block the
  // avatar (N=1 E=2 S=4 W=8). Undefined → no borders (today's free movement).
  edges?: string[]
}

export const PER_ROW = 5 // buildings per street row
const STREET_H = 1 // street-path rows below each building row
const GRASS_GAP = 2 // grass rows between the street and the next band/field —
// the minimum margin that keeps an autotiled grass cell from touching road and
// dirt on opposite orthogonal sides (the no-thin-strip invariant). Fixed,
// independent of building height.
const COL_GAP = 1 // grass cells between adjacent plots in a row
const TOP_MARGIN = 2 // grass rows above the first building row
const BOTTOM_MARGIN = 2 // grass rows below the last street, before the gate
const FIELD_GAP = 0 // field starts right after the band's own grass rows
const FIELD_H = 7 // height of the tall-grass field block (wild encounters)

// Where the door sits within a 3x4 plot, as a cell offset from its top-left.
// Default is bottom-centre (today's hardcoded col+1, row+3). An admin-mapped
// building (issue #29) overrides it so the entrance lines up with its art —
// this single cell is what isWalkable / playerDepthAt / townInteractions read.
export interface DoorAnchor {
  dx: number
  dy: number
}

// Pull the door anchor off the active "building" tile-object, or undefined when
// none authored one (tree/flower/absent) → buildTown keeps the default.
export function doorAnchorFor(
  building: { door_dx?: number | null; door_dy?: number | null } | null | undefined,
): DoorAnchor | undefined {
  if (building == null || building.door_dx == null || building.door_dy == null) return undefined
  return { dx: building.door_dx, dy: building.door_dy }
}

// Is footprint cell (x,y) an authored ladder ('L', #54)? Walkable like a path,
// but the avatar climbs while standing on it (with a walk fallback). Out-of-
// footprint or unmasked cells are never ladders — buildings opt in per cell.
export function isLadderCell(buildings: Building[], x: number, y: number): boolean {
  return buildings.some(
    (b) =>
      x >= b.col &&
      x < b.col + b.w &&
      y >= b.row &&
      y < b.row + b.h &&
      b.mask?.[y - b.row]?.[x - b.col] === 'L',
  )
}

// An authored interior walk mask (#32): a row-major grid the size of the
// footprint, '#' = solid, '.' = walkable porch (avatar over), 'o' = walkable
// overhang (#44, avatar under). The door cell (door_dx/door_dy, #29) is always
// walkable on top of this. Pull it off the active building object, or undefined
// when none authored one.
export function walkMaskFor(
  building: { walk_mask?: string[] | null } | null | undefined,
): string[] | undefined {
  if (building == null || building.walk_mask == null || building.walk_mask.length === 0) return undefined
  return building.walk_mask
}

// A plot's tile footprint (#30). Sourced from the active mapped building, but
// clamped to a sane range so the uniform grid never runs away: width 3..20,
// height 4..20. Today's 3x4 is the minimum (the nameplate + roof/body 36/64
// split need it); 20x20 the documented cap (matches the mapper's MAX_FP).
//
// Raised from 15x15 (#31): art authored taller than 15 tiles — e.g. the
// 448x608px classic-darkblue, 14x19 — was silently clamped, so its footprint
// could never match its own art no matter what the packer does.
export interface Footprint {
  w: number
  h: number
}
const MIN_W = 3
const MAX_W = 20
const MIN_H = 4
const MAX_H = 20
const DEFAULT_FOOTPRINT: Footprint = { w: MIN_W, h: MIN_H }

// Clamp an authored footprint to [3..20] x [4..20], floored to whole tiles.
// Non-finite input falls back to the minimum so a malformed object can't break
// the grid arithmetic.
export function clampFootprint(w: number, h: number): Footprint {
  const cw = Number.isFinite(w) ? Math.floor(w) : MIN_W
  const ch = Number.isFinite(h) ? Math.floor(h) : MIN_H
  return {
    w: Math.max(MIN_W, Math.min(MAX_W, cw)),
    h: Math.max(MIN_H, Math.min(MAX_H, ch)),
  }
}

// Pull the footprint off the active "building" tile-object, clamped. Absent or
// null fields fall back to today's 3x4 so non-mapped towns stay identical.
export function footprintFor(
  building: { footprint_w?: number | null; footprint_h?: number | null } | null | undefined,
): Footprint {
  if (building == null) return { ...DEFAULT_FOOTPRINT }
  return clampFootprint(building.footprint_w ?? MIN_W, building.footprint_h ?? MIN_H)
}

// The default door: bottom-centre of the footprint. Lands on the perimeter
// (street below) for any size, so it is always reachable. At 3x4 this is {1,3}
// — matching today's hardcoded col+1, row+3.
export function defaultDoorFor(w: number, h: number): DoorAnchor {
  return { dx: Math.floor((w - 1) / 2), dy: h - 1 }
}

// A door is reachable only if at least one orthogonal neighbour lies outside
// the footprint box (every outside cell around a plot is walkable ground/street).
// An interior door is walled in by its own building and can't be entered.
function doorOnPerimeter(w: number, h: number, dx: number, dy: number): boolean {
  return dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1
}

// The rules one plot's walk data obeys (#30/#32/#53): a mask applies only when
// sized to the footprint (a stale mask falls back to a solid box / free
// movement), the door clamps into the box, and an unreachable door — off the
// perimeter with no walkable mask path to an edge — snaps to the bottom-centre
// default.
function plotWalk(
  W: number,
  H: number,
  door: DoorAnchor | undefined,
  walkMask?: string[],
  edgeMask?: string[],
) {
  const fit = (m: string[] | undefined) =>
    m && m.length === H && m.every((row) => row.length === W) ? m : undefined
  const mask = fit(walkMask)
  const edges = fit(edgeMask)
  const def = defaultDoorFor(W, H)
  let ddx = Math.max(0, Math.min(W - 1, Math.floor(door?.dx ?? def.dx)))
  let ddy = Math.max(0, Math.min(H - 1, Math.floor(door?.dy ?? def.dy)))
  const reachable = mask
    ? walkMaskConnected(mask, W, H, { dx: ddx, dy: ddy })
    : doorOnPerimeter(W, H, ddx, ddy)
  if (!reachable) {
    ddx = def.dx
    ddy = def.dy
  }
  return { mask, edges, ddx, ddy }
}

// Re-stamp one plot's walk data from ITS resolved building (#292): the door,
// walk mask and edge mask travel with the assigned art, under the same rules
// as the shared stamp (plotWalk). Null — no assignment and no active object —
// leaves the shared plot untouched. The plot is already sized to this same
// building's footprint (#31), so its mask fits.
export function plotWithBuilding(
  plot: Plot,
  building:
    | { door_dx?: number | null; door_dy?: number | null; walk_mask?: string[] | null; edge_mask?: string[] | null }
    | null
    | undefined,
): Plot {
  if (building == null) return plot
  const { mask, edges, ddx, ddy } = plotWalk(
    plot.w,
    plot.h,
    doorAnchorFor(building),
    walkMaskFor(building),
    edgeMaskFor(building),
  )
  return { ...plot, doorCol: plot.col + ddx, doorRow: plot.row + ddy, mask, edges }
}

// Build the whole town for a given number of building plots. Returns a `town`
// object: { cols, rows, map (string[]), plots, entrance }. `footprint` is either
// one size every plot shares (#30) or a per-plot list — each community's own
// assigned building (#292) — which this packs (#31).
export function buildTown(
  plotCount: number,
  door?: DoorAnchor,
  footprint?: Footprint | Footprint[],
  walkMask?: string[],
  edgeMask?: string[],
  policy?: HometownPolicy | null,
): Town {
  const count = Math.max(plotCount, 1)
  const sizeAt = (i: number) => (Array.isArray(footprint) ? footprint[i] : footprint)
  const sizes = Array.from({ length: count }, (_, i) =>
    clampFootprint(sizeAt(i)?.w ?? MIN_W, sizeAt(i)?.h ?? MIN_H),
  )

  // Pack left→right, wrapping every PER_ROW plots. Each band is as tall as its
  // tallest plot and the map as wide as its widest band; a uniform list gives
  // back exactly the old grid arithmetic. ponytail: count-based wrap, not a
  // width budget — swap in a max row width when a town outgrows the screen.
  const bands: Footprint[][] = []
  for (let i = 0; i < count; i += PER_ROW) bands.push(sizes.slice(i, i + PER_ROW))
  const bandW = (b: Footprint[]) => b.reduce((n, f) => n + f.w, 0) + COL_GAP * (b.length - 1)
  const bandH = (b: Footprint[]) => Math.max(...b.map((f) => f.h)) + STREET_H + GRASS_GAP
  const numRows = bands.length

  // A one- or two-plot town still gets three plots' worth of width, so the
  // entrance avenue and the field either side of it have room.
  const widest = Math.max(...sizes.map((f) => f.w))
  const cols = Math.max(...bands.map(bandW), 3 * widest + 2 * COL_GAP) + 5
  const rows =
    1 + TOP_MARGIN + bands.reduce((n, b) => n + bandH(b), 0) + FIELD_GAP + FIELD_H + BOTTOM_MARGIN + 1

  // The first plots (by position_order) sit on the bottom-most band, so bands
  // are laid out from the last one down. `base` is a band's street row — the
  // row its buildings stand on.
  const bandTop: number[] = []
  for (let b = numRows - 1, y = 1 + TOP_MARGIN; b >= 0; b--) {
    bandTop[b] = y
    y += bandH(bands[b])
  }
  const bandBase = (b: number) => bandTop[b] + Math.max(...bands[b].map((f) => f.h))

  // Each plot is its own size, bottom-aligned in its band so its door still
  // opens onto the street row directly below. The active object's door/masks
  // are the shared starting point; a mask that doesn't fit this plot's size
  // falls back to a solid box (plotWalk), and TownScene then re-stamps each
  // plot from its own building (plotWithBuilding).
  const plots: Plot[] = []
  for (let i = 0; i < count; i++) {
    const b = Math.floor(i / PER_ROW)
    const { w, h } = sizes[i]
    const col = bands[b].slice(0, i % PER_ROW).reduce((n, f) => n + f.w + COL_GAP, 2)
    const row = bandBase(b) - h
    const { mask, edges, ddx, ddy } = plotWalk(w, h, door, walkMask, edgeMask)
    plots.push({ col, row, w, h, doorCol: col + ddx, doorRow: row + ddy, mask, edges })
  }

  const streetPathRows = new Set<number>()
  const buildingRows = new Set<number>()
  for (let b = 0; b < numRows; b++) {
    streetPathRows.add(bandBase(b))
    for (let y = bandTop[b]; y < bandBase(b); y++) buildingRows.add(y)
  }
  const lastStreetPath = bandBase(0)
  const entranceCol = Math.floor(cols / 2)

  const fieldTop = bandTop[0] + bandH(bands[0]) + FIELD_GAP
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

  const grid = { cols, rows, map }
  const entrance = { x: entranceCol, y: rows - 2 }

  // The interactive regions (#255), payloads from policy. The tall-grass field
  // is two encounter zones flanking the entrance avenue — the road column cuts
  // through the field rect and must stay a safe corridor, and a Zone is a rect.
  // The gate trainer stands one tile east of the entrance, on the row just
  // inside the south margin, looking left across the road — five tiles,
  // clipped to the map because the kernel cone is unclipped.
  const grass = (left: number, right: number): Zone => ({
    trigger: 'on_enter',
    x: left,
    y: fieldTop,
    w: right - left + 1,
    h: FIELD_H,
    payload: { kind: 'encounter', pool: policy?.wildPool ?? '' },
  })
  const zones: Zone[] = [
    grass(fieldLeft, entranceCol - 1),
    grass(entranceCol + 1, fieldRight),
    {
      trigger: 'on_sight',
      x: entrance.x + 1,
      y: entrance.y - 1,
      facing: 'left',
      range: Math.min(5, entrance.x + 1),
      payload: { kind: 'trainer', npcId: policy?.gateNpcId ?? 0 },
    },
  ]

  return { ...grid, plots, entrance, entities: placeFoliage(grid, policy), zones }
}

// Resolve the policy's active kinds to placed-entity references (#173): one
// tree per boundary 'T' cell, and the '*' scatter clustered into full-footprint
// groups plus leftover singles (planFlowers, #27). With no active group, every
// scatter cell is a leftover, so it all falls to the single.
function placeFoliage(grid: TileGrid, policy?: HometownPolicy | null): PlacedEntity[] {
  const out: PlacedEntity[] = []
  if (!policy) return out
  if (policy.tree) {
    for (let y = 0; y < grid.rows; y++)
      for (let x = 0; x < grid.cols; x++)
        if (grid.map[y][x] === 'T') out.push({ kind: 'prop', object_id: policy.tree.id, x, y })
  }
  if (policy.flowerGroup || policy.flowerSingle) {
    const gw = Math.max(1, Math.floor(policy.flowerGroup?.footprint_w || 1))
    const gh = Math.max(1, Math.floor(policy.flowerGroup?.footprint_h || 1))
    const { groups, singles } = planFlowers(grid, gw, gh)
    if (policy.flowerGroup) {
      for (const g of groups) out.push({ kind: 'prop', object_id: policy.flowerGroup.id, x: g.x, y: g.y })
    }
    if (policy.flowerSingle) {
      // No group → the 1×1 default footprint makes `groups` exactly the '*'
      // cells; hand them to the single instead of dropping the whole scatter.
      const cells = policy.flowerGroup ? singles : [...groups, ...singles]
      for (const s of cells) out.push({ kind: 'prop', object_id: policy.flowerSingle.id, x: s.x, y: s.y })
    }
  }
  return out
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

export interface FlowerGroup {
  x: number
  y: number
  w: number
  h: number
}

export interface FlowerLayout {
  groups: FlowerGroup[] // each a full WxH stamp of the flower-group art
  singles: Array<{ x: number; y: number }> // leftover/lone '*' cells → 1x1 fallback
}

// Cluster-aware flower placement (#27). A greedy row-major scan anchors a full
// WxH flower-group wherever every covered cell is an uncovered '*', so big '*'
// patches read as the authored group instead of N identical tiles, and a group
// never clips across a non-flower cell. Whatever's left over (patch edges, lone
// '*') falls to single 1x1 cells. Pure + deterministic, like flowerAt. A 1x1
// footprint degenerates to one group per '*' — the pre-#27 one-per-cell paint.
export function planFlowers(town: TileGrid, w: number, h: number): FlowerLayout {
  const gw = Math.max(1, Math.floor(w))
  const gh = Math.max(1, Math.floor(h))
  const covered = new Set<string>()
  const isFree = (x: number, y: number) => tileChar(town, x, y) === '*' && !covered.has(`${x},${y}`)
  const fits = (x: number, y: number) => {
    for (let dy = 0; dy < gh; dy++) for (let dx = 0; dx < gw; dx++) if (!isFree(x + dx, y + dy)) return false
    return true
  }

  const groups: FlowerGroup[] = []
  for (let y = 0; y < town.rows; y++) {
    for (let x = 0; x < town.cols; x++) {
      if (!fits(x, y)) continue
      groups.push({ x, y, w: gw, h: gh })
      for (let dy = 0; dy < gh; dy++) for (let dx = 0; dx < gw; dx++) covered.add(`${x + dx},${y + dy}`)
    }
  }

  const singles: Array<{ x: number; y: number }> = []
  for (let y = 0; y < town.rows; y++)
    for (let x = 0; x < town.cols; x++) if (isFree(x, y)) singles.push({ x, y })
  return { groups, singles }
}

// Player render depth at a tile. On a building's door tile, its exit corridor
// (the door's column from the door down to the footprint's south edge, #46), OR
// an authored walk-mask path cell (#32), beat that building's sprite depth
// ((row+h)*10 - 1 in townRenderer) so the avatar reads as standing in the
// doorway / walking out / on the porch instead of clipping under the house;
// elsewhere, the row-banded default. An overhang cell ('o', #44) is deliberately
// NOT lifted — its default depth stays below the house body sprite, so the
// building art overhangs the avatar there.
export function playerDepthAt(buildings: Building[], x: number, y: number): number {
  const on = buildings.find(
    (b) =>
      (b.doorCol === x && b.doorRow === y) ||
      (b.doorCol === x && y >= b.doorRow && y < b.row + b.h) ||
      (x >= b.col &&
        x < b.col + b.w &&
        y >= b.row &&
        y < b.row + b.h &&
        // A porch '.' or ladder 'L' cell lifts the avatar over the house; an
        // overhang 'o' deliberately stays below (the building overhangs it).
        (b.mask?.[y - b.row]?.[x - b.col] === '.' || b.mask?.[y - b.row]?.[x - b.col] === 'L')),
  )
  return on ? (on.row + on.h) * 10 : y * 10 + 5
}

// Depth for a building's foreground-mask overlay (#36). Sits two above the
// building's south band ((row+h)*10): it beats the avatar while the avatar is
// on the building's cells (playerDepthAt collapses to (row+h)*10 there, #937cc75)
// and the house body sprite ((row+h)*10 - 1), but the avatar's own-row depth
// (y*10+5, min (row+h)*10+5 at the south edge) beats it once south of the
// footprint — so the foliage covers the avatar on the building, not off it.
export function buildingOverlayDepth(b: { row: number; h: number }): number {
  return (b.row + b.h) * 10 + 2
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
  const inside = buildings.find((b) => x >= b.col && x < b.col + b.w && y >= b.row && y < b.row + b.h)
  if (inside) {
    // A footprint cell is walkable only where the authored mask marks it (#32):
    // '.' porch or 'o' overhang (#44); an unmasked building stays a solid box.
    return maskCharWalkable(inside.mask?.[y - inside.row]?.[x - inside.col])
  }
  return !blockers.has(`${x},${y}`)
}

// Pull the authored edge mask off the active "building" tile-object, or
// undefined when none authored one (no impassable borders → free movement).
export function edgeMaskFor(
  building: { edge_mask?: string[] | null } | null | undefined,
): string[] | undefined {
  if (building == null || building.edge_mask == null || building.edge_mask.length === 0) return undefined
  return building.edge_mask
}

// Does building `b` mark `bit` of its footprint cell (x,y) as an impassable
// border? Out-of-footprint or unmasked cells mark nothing.
function sideBlocked(b: Building, x: number, y: number, bit: number): boolean {
  const ch = b.edges?.[y - b.row]?.[x - b.col]
  return ch != null && (parseInt(ch, 16) & bit) !== 0
}

// Is the step from (fx,fy) to an orthogonally-adjacent (tx,ty) blocked by an
// authored impassable border (#53)? Pure, transition-aware companion to
// isWalkable (which only judges a single destination cell). Symmetric: the
// border between two cells is blocked when EITHER cell's edge mask marks the
// shared side. Buildings with no edge mask never block — backward compatible.
export function edgeBlocked(buildings: Building[], fx: number, fy: number, tx: number, ty: number): boolean {
  const dx = tx - fx
  const dy = ty - fy
  const fromSide = dx === 1 ? EDGE_E : dx === -1 ? EDGE_W : dy === 1 ? EDGE_S : EDGE_N
  const toSide = dx === 1 ? EDGE_W : dx === -1 ? EDGE_E : dy === 1 ? EDGE_N : EDGE_S
  return buildings.some((b) => sideBlocked(b, fx, fy, fromSide) || sideBlocked(b, tx, ty, toSide))
}
