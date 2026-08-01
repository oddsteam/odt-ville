// The collision masks a tile object can author, and their round trip to the
// stored row-major strings the town stamps. Split out of TileMapper.tsx in #353.

import { EDGE_N, EDGE_E, EDGE_S, EDGE_W } from '../kernel/walkMask.ts'

// Turn the set of painted walkable cells ("dx,dy") into the row-major walk mask
// the town stamps (issue #32): '.' = walkable (porch/path), '#' = solid. Cells
// outside the cols×rows footprint are dropped.
export function buildWalkMask(
  walk: ReadonlySet<string>,
  cols: number,
  rows: number,
  overhang: ReadonlySet<string> = new Set(),
  ladder: ReadonlySet<string> = new Set(),
): string[] {
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    // 'o' overhang (#44, avatar under) > 'L' ladder (#54, climb) > '.' porch; else '#'.
    for (let c = 0; c < cols; c++) {
      const k = `${c},${r}`
      row += overhang.has(k) ? 'o' : ladder.has(k) ? 'L' : walk.has(k) ? '.' : '#'
    }
    out.push(row)
  }
  return out
}

// Which tile objects author a collision walk mask (#338). A building always
// carries one (footprint solid except its authored porch/path, #32). A prop
// carries one only when Collides is on — then its footprint blocks like a
// building and the Walkable paint mode carves pass-through cells. Every other
// kind (and a plain prop) is walk-over and saves no mask (ADR-0008: a placed
// entity blocks nothing by default).
export function authorsWalkMask(kind: string, collides: boolean): boolean {
  return kind === 'building' || (kind === 'prop' && collides)
}

// Which tile objects run the building door-reachability guard (validateWalkMask,
// #32) at save. Only a building, and only once a door is actually placed (#343):
// a door-less building is pure scenery — its footprint saves as a solid box and
// the hometown fallback bottom-centre door still applies at runtime. A placed
// door, though, must reach a footprint edge (an unreachable door is always a
// mistake), so it keeps the existing block. A collidable prop has no door, so
// its mask saves exactly as painted; this is the no-door validation split of
// #338/#343.
export function requiresDoorValidation(
  kind: string,
  door: { dx: number; dy: number } | null | undefined,
): boolean {
  return kind === 'building' && door != null
}

// Inverse of buildWalkMask — turn a stored row-major walk mask back into the set
// of painted "dx,dy" walkable cells, so a saved building loads into the editor
// with its porch/path already painted (#32).
export function walkCellsFromMask(mask: readonly string[]): Set<string> {
  return cellsMarked(mask, '.')
}

// The 'o' overhang cells of a stored mask (#44), as "dx,dy" keys — so a saved
// building loads back into the editor with its overhang painting intact.
export function overhangCellsFromMask(mask: readonly string[]): Set<string> {
  return cellsMarked(mask, 'o')
}

// The 'L' ladder cells of a stored mask (#54), as "dx,dy" keys — so a saved
// building loads back into the editor with its ladder painting intact.
export function ladderCellsFromMask(mask: readonly string[]): Set<string> {
  return cellsMarked(mask, 'L')
}

function cellsMarked(mask: readonly string[], mark: string): Set<string> {
  const out = new Set<string>()
  mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === mark) out.add(`${c},${r}`)
  })
  return out
}

// Impassable cell borders (#53): bit per side, matching town.ts's edge mask.
const SIDE_BIT: Record<string, number> = { N: EDGE_N, E: EDGE_E, S: EDGE_S, W: EDGE_W }

// Turn the painted set of "c,r,side" borders into the row-major hex edge mask
// the town stamps (#53): one hex digit per cell whose bits mark blocked sides.
// Marks outside the cols×rows footprint are dropped.
export function buildEdgeMask(edges: ReadonlySet<string>, cols: number, rows: number): string[] {
  const bits: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (const key of edges) {
    const [c, r, side] = key.split(',')
    const x = Number(c)
    const y = Number(r)
    if (x < 0 || x >= cols || y < 0 || y >= rows || !SIDE_BIT[side]) continue
    bits[y][x] |= SIDE_BIT[side]
  }
  return bits.map((row) => row.map((b) => b.toString(16)).join(''))
}

// Inverse of buildEdgeMask — a stored hex edge mask back into the painted set of
// "c,r,side" keys, so a saved building loads into the editor with its borders.
export function edgeSetFromMask(mask: readonly string[]): Set<string> {
  const out = new Set<string>()
  mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const bits = parseInt(row[c], 16)
      for (const side of Object.keys(SIDE_BIT)) if (bits & SIDE_BIT[side]) out.add(`${c},${r},${side}`)
    }
  })
  return out
}
