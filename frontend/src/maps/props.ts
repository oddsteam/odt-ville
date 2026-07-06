// Prop placement model (#139, ADR-0008). A prop is a *reference* to a saved
// tile object — the shared catalog authored in /admin/objects — stamped on a
// tile above the ground: `{kind:"prop", object_id, x, y}`. Art, footprint and
// masks live on the object; the map stores only the reference, so editing the
// object rethemes every map that placed it. A prop *occupies* its authored
// footprint on the grid (fractions round up to whole cells): placement
// replaces whatever it overlaps, refuses to hang off the map, and erasing
// works from any covered cell. Pure and Phaser-free.

import type { BakedEntity } from './schema.ts'

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

const cells = (v: number) => Math.max(1, Math.ceil(v))

// The whole-cell rect a prop occupies.
function rectOf(p: PlacedProp, sizeOf: SizeOf) {
  const { w, h } = sizeOf(p.object_id)
  return { x: p.x, y: p.y, w: cells(w), h: cells(h) }
}

function overlaps(a: PlacedProp, b: PlacedProp, sizeOf: SizeOf): boolean {
  const ra = rectOf(a, sizeOf)
  const rb = rectOf(b, sizeOf)
  return ra.x < rb.x + rb.w && rb.x < ra.x + ra.w && ra.y < rb.y + rb.h && rb.y < ra.y + ra.h
}

// Stamp a prop, replacing every prop its footprint overlaps (a re-stamp swaps,
// a move is erase-then-place). A footprint that would hang off the cols×rows
// grid is refused — the input comes back unchanged. Fresh list otherwise.
export function placeProp(
  props: readonly PlacedProp[],
  prop: PlacedProp,
  sizeOf: SizeOf,
  bounds: { cols: number; rows: number },
): PlacedProp[] {
  const r = rectOf(prop, sizeOf)
  if (r.x + r.w > bounds.cols || r.y + r.h > bounds.rows) return props as PlacedProp[]
  return [...props.filter((p) => !overlaps(p, prop, sizeOf)), prop]
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
// tile, with `valid` false when it would hang off the grid (the same edge
// refusal placeProp enforces) so the caller can tint it red. In erase mode it's
// the footprint of the prop under the cursor — what a click removes — or null
// when there's none. Pure presentation: never touches the placed list.
export function propGhost(
  hover: { x: number; y: number },
  tool: number | 'erase',
  props: readonly PlacedProp[],
  sizeOf: SizeOf,
  bounds: { cols: number; rows: number },
): { x: number; y: number; w: number; h: number; valid: boolean } | null {
  if (tool === 'erase') {
    const hit = props.find((p) => {
      const r = rectOf(p, sizeOf)
      return hover.x >= r.x && hover.x < r.x + r.w && hover.y >= r.y && hover.y < r.y + r.h
    })
    return hit ? { ...rectOf(hit, sizeOf), valid: true } : null
  }
  const { w, h } = sizeOf(tool)
  const rect = { x: hover.x, y: hover.y, w: cells(w), h: cells(h) }
  return { ...rect, valid: rect.x + rect.w <= bounds.cols && rect.y + rect.h <= bounds.rows }
}

// Bake the placed props into the runtime's entity list (kind:"prop" references).
export function propEntities(props: readonly PlacedProp[]): BakedEntity[] {
  return props.map((p) => ({ kind: 'prop', object_id: p.object_id, x: p.x, y: p.y }))
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
