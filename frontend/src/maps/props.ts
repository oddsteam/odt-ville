// Prop placement model (#139, ADR-0008). A prop is a *reference* to a saved
// tile object — the shared catalog authored in /admin/objects — stamped on a
// tile above the ground: `{kind:"prop", object_id, x, y}`. Art, footprint and
// masks live on the object; the map stores only the reference, so editing the
// object rethemes every map that placed it. A prop *occupies* its authored
// footprint on the grid (fractions round up to whole cells): placement
// stacks on whatever it overlaps, may overflow the map edge as long as one cell
// stays on-map (#340, and via nudging any edge into a negative anchor — #341),
// and erasing works from any covered cell. Pure and Phaser-free.

import type { BakedEntity } from '../kernel/schema.ts'

// A prop stamped on the grid. Display data (image, footprint, name) is looked
// up from the fetched objects by id — the placed model is just the reference.
export interface PlacedProp {
  object_id: number
  x: number
  y: number
}

// The footprint lookup the grid ops resolve against — raw tile spans off the
// object (may be fractional, e.g. 1.4×1.8); occupancy ceils to whole cells.
export type SizeOf = (object_id: number) => { w: number; h: number }

// The walk-mask lookup denormalized onto baked entities at save (#166): the
// authoring paint a placed object carries, resolved from the catalog by id so
// re-authoring a mask re-applies on the next save (never stored in the placed
// model). `undefined` for a plain prop / dangling reference omits the field →
// blocks nothing, consistent with ADR-0008.
export type MaskOf = (object_id: number) => readonly string[] | undefined

// The door-anchor lookup denormalized onto baked entities at save (#29, #212):
// the entrance cell a placed building carries, resolved from the catalog by id
// like `MaskOf`. `undefined` for a non-building / dangling reference omits the
// fields → no door cell, consistent with ADR-0008.
export type DoorOf = (object_id: number) => { dx: number; dy: number } | undefined

const cells = (v: number) => Math.max(1, Math.ceil(v))

// The whole-cell rect a prop occupies.
function rectOf(p: PlacedProp, sizeOf: SizeOf) {
  const { w, h } = sizeOf(p.object_id)
  return { x: p.x, y: p.y, w: cells(w), h: cells(h) }
}

// Does a footprint rect keep at least one whole cell on the cols×rows map?
// Large edge scenery may overflow the right/bottom (and, with nudging, the
// top/left) as long as some cell still lands on-map (#340, #341) — a footprint
// entirely off the map is the only placement refused.
function anyCellOnMap(
  r: { x: number; y: number; w: number; h: number },
  bounds: { cols: number; rows: number },
): boolean {
  return r.x < bounds.cols && r.x + r.w > 0 && r.y < bounds.rows && r.y + r.h > 0
}

// Stamp a prop on top of whatever is there — props stack (a bench under a
// tree's canopy), appended last so it draws and selects topmost; a move is
// erase-then-place. A footprint that lands entirely off the cols×rows grid is
// refused — the input comes back unchanged; overflow past any edge is allowed
// so long as one cell stays on-map (#340). Fresh list otherwise.
export function placeProp(
  props: readonly PlacedProp[],
  prop: PlacedProp,
  sizeOf: SizeOf,
  bounds: { cols: number; rows: number },
): PlacedProp[] {
  const r = rectOf(prop, sizeOf)
  if (!anyCellOnMap(r, bounds)) return props as PlacedProp[]
  return [...props, prop]
}

// Which placed prop a cell lands on — any cell of its footprint, not just the
// anchor — for click-selection in decorate mode (#341). Later props win where
// footprints overlap, matching placeProp's append order (a re-stamp sits
// last). -1 off any prop. Rect-based, so a negative-anchor prop is found from
// its on-map cell.
export function propIndexAt(props: readonly PlacedProp[], x: number, y: number, sizeOf: SizeOf): number {
  for (let i = props.length - 1; i >= 0; i--) {
    const r = rectOf(props[i], sizeOf)
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i
  }
  return -1
}

// The four arrow-key nudge directions and their cell delta.
export type NudgeDir = 'up' | 'down' | 'left' | 'right'
const NUDGE: Record<NudgeDir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

// Move the selected prop one cell in `dir`, re-placing through placeProp so
// edge rules and save behaviour stay uniform (#341). The move is the
// fine-positioning tool for large art and the only way to reach a negative
// anchor (top/left overhang) — a grid click can only name an on-map cell. A
// nudge that would push the last footprint cell off the map is refused: the
// list and index come back unchanged (we pre-check rather than let placeProp
// silently drop the prop after we've removed it). Returns the moved prop's new
// index — placeProp appends it last — so the caller keeps it selected for the
// next press.
export function nudgeProp(
  props: readonly PlacedProp[],
  index: number,
  dir: NudgeDir,
  sizeOf: SizeOf,
  bounds: { cols: number; rows: number },
): { props: PlacedProp[]; index: number } {
  const prop = props[index]
  if (!prop) return { props: props as PlacedProp[], index }
  const { dx, dy } = NUDGE[dir]
  const moved = { ...prop, x: prop.x + dx, y: prop.y + dy }
  if (!anyCellOnMap(rectOf(moved, sizeOf), bounds)) return { props: props as PlacedProp[], index }
  const next = placeProp(props.filter((_, i) => i !== index), moved, sizeOf, bounds)
  return { props: next, index: next.length - 1 }
}

// Remove the prop covering a cell — any cell of its footprint, not just the
// anchor. Off any prop it's a no-op (returns the input).
export function erasePropAt(
  props: readonly PlacedProp[],
  x: number,
  y: number,
  sizeOf: SizeOf,
): PlacedProp[] {
  const next = props.filter((p) => {
    const r = rectOf(p, sizeOf)
    return x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h
  })
  return next.length === props.length ? (props as PlacedProp[]) : next
}

// Every "x,y" cell the placed props occupy — the grid's markers and
// aria-pressed state.
export function coveredCells(props: readonly PlacedProp[], sizeOf: SizeOf): Set<string> {
  const out = new Set<string>()
  for (const p of props) {
    const r = rectOf(p, sizeOf)
    for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) out.add(`${r.x + dx},${r.y + dy}`)
  }
  return out
}

// The footprint rect a hover would act on, for the ghost cursor (#144). In
// place mode (numeric tool) it's the selected object's footprint at the hovered
// tile, with `valid` false only when no cell lands on the grid (the same
// refusal placeProp enforces) so the caller can tint it red — edge overflow is
// valid (#340). In erase mode it's
// the footprint of the prop under the cursor — what a click removes — or null;
// select mode outlines the topmost prop there (what a click selects) — or null
// when there's none. Pure presentation: never touches the placed list.
export function propGhost(
  hover: { x: number; y: number },
  tool: number | 'erase' | 'select',
  props: readonly PlacedProp[],
  sizeOf: SizeOf,
  bounds: { cols: number; rows: number },
): { x: number; y: number; w: number; h: number; valid: boolean } | null {
  if (tool === 'select') {
    const i = propIndexAt(props, hover.x, hover.y, sizeOf)
    return i >= 0 ? { ...rectOf(props[i], sizeOf), valid: true } : null
  }
  if (tool === 'erase') {
    const hit = props.find((p) => {
      const r = rectOf(p, sizeOf)
      return hover.x >= r.x && hover.x < r.x + r.w && hover.y >= r.y && hover.y < r.y + r.h
    })
    return hit ? { ...rectOf(hit, sizeOf), valid: true } : null
  }
  const { w, h } = sizeOf(tool)
  const rect = { x: hover.x, y: hover.y, w: cells(w), h: cells(h) }
  return { ...rect, valid: anyCellOnMap(rect, bounds) }
}

// Bake the placed props into the runtime's entity list (kind:"prop" references).
// Any placed object whose `maskOf` yields a walk_mask (buildings and future
// paintable kinds) gets it denormalized onto the entity, so runtime collision
// (mapWalkable/entityBlockedFor read inline walk_mask) applies with no manual
// painting. `edgeMaskOf` is the finer companion (#207): the object's edge_mask
// (fence-style border collision, read by entityEdgeBlockedFor) — independent of
// walk_mask, so an object may carry either, both, or neither. `doorOf` is the
// building entrance (#212): the object's door anchor (read by entityDoorCells)
// denormalized as door_dx/door_dy, independent of the masks. No lookups → plain
// references, unchanged.
export function propEntities(
  props: readonly PlacedProp[],
  maskOf?: MaskOf,
  edgeMaskOf?: MaskOf,
  doorOf?: DoorOf,
): BakedEntity[] {
  return props.map((p) => {
    const walk_mask = maskOf?.(p.object_id)
    const edge_mask = edgeMaskOf?.(p.object_id)
    const door = doorOf?.(p.object_id)
    return {
      kind: 'prop',
      object_id: p.object_id,
      x: p.x,
      y: p.y,
      ...(walk_mask ? { walk_mask } : {}),
      ...(edge_mask ? { edge_mask } : {}),
      ...(door ? { door_dx: door.dx, door_dy: door.dy } : {}),
    }
  })
}

// Reconstruct the editor's placed-prop list from a loaded map's entities: the
// kind:"prop" object references. Legacy tileset/frame props (seed fixtures)
// carry no reference — renderable but not editable here, so they're skipped
// (and preserved on save by decorationsBaked).
export function propsFromBaked(entities: readonly BakedEntity[]): PlacedProp[] {
  return entities
    .filter((e) => e.kind === 'prop' && e.object_id != null)
    .map((e) => ({ object_id: e.object_id!, x: e.x, y: e.y }))
}

// The distinct object ids a map's entities reference (any kind) — the one
// batched fetch (#138) the shared entity loader makes before rendering.
export function objectIdsFrom(entities: readonly BakedEntity[]): number[] {
  return [...new Set(entities.map((e) => e.object_id).filter((id): id is number => id != null))]
}
