// The kernel Walkability module (#172): the one owner of the walk-mask
// convention. A walk mask is row-major chars marking which footprint cells the
// avatar may stand on — '#' solid, '.' porch (avatar over the art), 'o'
// overhang (#44, avatar under), 'L' ladder (#54) — plus the door-reachability
// rules and the edge-blocking bit vocabulary (#53) built on it. Map-agnostic
// and dependency-free (ADR-0004 kernel), so the town producer, the authored-map
// path, and the authoring editor's save-time validation all call it legally.

// Does this cell char mean walkable? The positive set — anything else (unknown
// or missing) is solid. A building footprint is a solid box by default, so its
// mask carves walkable holes with this test.
export function maskCharWalkable(ch: string | undefined): boolean {
  return ch === '.' || ch === 'o' || ch === 'L'
}

// Does this cell char mean solid? Only an explicit '#'. A placed entity blocks
// nothing by default, so its mask marks collision cells with this test.
export function maskCharSolid(ch: string | undefined): boolean {
  return ch === '#'
}

// Does this cell char mean a ladder (#54)? Only an explicit 'L'. A ladder cell
// is walkable like a porch but drives the avatar's climb posture, so this test
// singles it out from the other walkable chars for the climb/walk decision.
export function maskCharLadder(ch: string | undefined): boolean {
  return ch === 'L'
}

// Does this cell char mean an overhang (#44)? Only an explicit 'o'. An overhang
// cell is walkable like a porch but the object's art must draw *over* the avatar
// (walk-under), so its depth stays below the object — this test singles it out
// from the other walkable chars for the depth decision.
export function maskCharOverhang(ch: string | undefined): boolean {
  return ch === 'o'
}

// Is the cell (x,y) walkable within a w×h walk mask? The door cell is walkable
// regardless of the mask; otherwise a walkable char marks walkable and anything
// else (or out of bounds) is solid.
function maskCellWalkable(
  mask: string[],
  w: number,
  h: number,
  door: { dx: number; dy: number },
  x: number,
  y: number,
): boolean {
  if (x < 0 || x >= w || y < 0 || y >= h) return false
  if (x === door.dx && y === door.dy) return true
  return maskCharWalkable(mask[y]?.[x])
}

// Is the door reachable from outside the footprint? Flood-fill from the door
// over walkable mask cells; the door is reachable if any reached cell lies on
// the footprint perimeter (every cell just outside the box is walkable ground).
export function walkMaskConnected(
  mask: string[],
  w: number,
  h: number,
  door: { dx: number; dy: number },
): boolean {
  if (!maskCellWalkable(mask, w, h, door, door.dx, door.dy)) return false
  const seen = new Set<string>([`${door.dx},${door.dy}`])
  const queue: Array<[number, number]> = [[door.dx, door.dy]]
  while (queue.length) {
    const [x, y] = queue.shift()!
    if (x === 0 || x === w - 1 || y === 0 || y === h - 1) return true
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as Array<[number, number]>) {
      const k = `${nx},${ny}`
      if (!seen.has(k) && maskCellWalkable(mask, w, h, door, nx, ny)) {
        seen.add(k)
        queue.push([nx, ny])
      }
    }
  }
  return false
}

// Save-time validation (#32). A building's walk mask is valid only when a door
// is defined, at least one walkable tile is painted, and the door connects to a
// footprint edge via walkable tiles. Pure, so the admin UI and any backend
// guard can share it.
export function validateWalkMask(
  mask: string[] | null | undefined,
  w: number,
  h: number,
  door: { dx: number; dy: number } | null | undefined,
): { ok: boolean; reason?: 'no-door' | 'no-walkable' | 'unreachable' } {
  if (door == null) return { ok: false, reason: 'no-door' }
  if (mask == null || !mask.some((row) => [...row].some(maskCharWalkable))) return { ok: false, reason: 'no-walkable' }
  if (!walkMaskConnected(mask, w, h, door)) return { ok: false, reason: 'unreachable' }
  return { ok: true }
}

// Edge-blocking bits for a footprint cell's four sides (#53), packed one hex
// digit per cell into a row-major edge mask the size of the footprint.
export const EDGE_N = 1
export const EDGE_E = 2
export const EDGE_S = 4
export const EDGE_W = 8
