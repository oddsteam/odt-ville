// Pins the inner (concave) corner resolution in the Map Baker (#119). When a
// higher-priority terrain wraps around a lower terrain's convex corner, the
// diagonal-only seam must bake to an inner-corner tile over the lower terrain's
// coverage — otherwise the concave junction renders as a hole. Terrains with no
// inner art fall back to a plain fill (no regression for today's grass/dirt).

import { describe, expect, it } from 'vitest'
import { makeCatalog } from '../game/phaser/tileCatalog.ts'
import { bakeGround } from './baker.ts'
import type { SourceMap } from './baker.ts'

const SHEET = 'test-sheet'
const R = 'road'
const G = 'grass'

// Grass wraps an L-shaped road; cell (col 2, row 2) touches the road only at its
// NW diagonal — the concave inner corner.
const CONCAVE: SourceMap = {
  slug: 'concave',
  title: 'Concave',
  cols: 3,
  rows: 3,
  terrain: [
    [R, R, G],
    [R, R, G],
    [G, G, G],
  ],
}

// road (base) < grass (top, owns seams). `cols: 4`, so frame = row * 4 + col.
const ART = [
  { tile_type: 'road', tileset: SHEET, col: 0, row: 0, role: 'fill', side: null },
  { tile_type: 'grass', tileset: SHEET, col: 1, row: 0, role: 'fill', side: null }, // frame 1
  { tile_type: 'grass', tileset: SHEET, col: 0, row: 1, role: 'edge', side: 'N' },
  { tile_type: 'grass', tileset: SHEET, col: 1, row: 1, role: 'edge', side: 'W' },
]
const INNER_TILE = { tile_type: 'grass', tileset: SHEET, col: 2, row: 1, role: 'inner', side: 'NW' } // frame 6

const withInner = makeCatalog([{ type: 'road' }, { type: 'grass', autotiled: true }], {
  tilesets: [{ name: SHEET, cell: 32, cols: 4 }],
  tiles: [...ART, INNER_TILE],
})
const withoutInner = makeCatalog([{ type: 'road' }, { type: 'grass', autotiled: true }], {
  tilesets: [{ name: SHEET, cell: 32, cols: 4 }],
  tiles: ART,
})

const ROAD_FILL = 0
const GRASS_FILL = 1
const GRASS_INNER_NW = 6

describe('baker inner (concave) corners', () => {
  it('bakes the inner-corner tile over the diagonal terrain at the concave seam', () => {
    const cell = bakeGround(CONCAVE, withInner).cells[2][2]
    const frames = cell.map((l) => l.frame)

    expect(frames).toContain(GRASS_INNER_NW)

    // The lower (diagonal) terrain is drawn beneath the transparent-notched tile
    // so the concave corner reveals it.
    const inner = cell.find((l) => l.frame === GRASS_INNER_NW)!
    const coverage = cell.find((l) => l.frame === ROAD_FILL)!
    expect(coverage).toBeTruthy()
    expect(coverage.depth).toBeLessThan(inner.depth)

    // A flat grass fill would paint over the notch — a concave cell must not emit
    // one.
    expect(frames).not.toContain(GRASS_FILL)
  })

  it('falls back to a plain fill when the terrain has no inner-corner art', () => {
    const cell = bakeGround(CONCAVE, withoutInner).cells[2][2]
    expect(cell.map((l) => l.frame)).toEqual([GRASS_FILL])
  })
})
