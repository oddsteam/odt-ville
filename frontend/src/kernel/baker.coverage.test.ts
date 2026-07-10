// Pins the road/dirt coverage rules in the shared baker (#171) — the two
// runtime special-cases the town renderer's paintGround carried that the baker
// lacked, ported here so the hometown can bake in the producer (ADR-0003):
//   * road (the opaque base) extends one cell in every direction beneath
//     neighbouring painted terrain, diagonals included, so caps and corners
//     stay covered under transparent edge tiles;
//   * dirt lays a one-cell mask beneath neighbouring grass, autotiled against
//     the mask's own boundary when dirt has edge art (flat fill otherwise);
//   * the generic coverage backing is suppressed where those layers already
//     painted the cell, so no duplicate stacks.

import { describe, expect, it } from 'vitest'
import { makeCatalog } from './tileCatalog.ts'
import { bakeGround } from './baker.ts'
import type { SourceMap } from './baker.ts'

const SHEET = 't'
const R = 'road'
const D = 'dirt'
const G = 'grass'
const _ = null

// frame = row * 8 + col
const ROAD_FILL = 0
const DIRT_FILL = 1
const GRASS_FILL = 2
const GRASS_EDGE = { N: 8, S: 9, E: 10, W: 11 }
const GRASS_CORNER = { NE: 16, NW: 17, SE: 18, SW: 19 }
const DIRT_EDGE = { N: 24, S: 25, E: 26, W: 27 }

const FILLS = [
  { tile_type: 'road', tileset: SHEET, col: 0, row: 0, role: 'fill', side: null },
  { tile_type: 'dirt', tileset: SHEET, col: 1, row: 0, role: 'fill', side: null },
  { tile_type: 'grass', tileset: SHEET, col: 2, row: 0, role: 'fill', side: null },
]
const GRASS_ART = [
  ...(['N', 'S', 'E', 'W'] as const).map((side, i) => ({
    tile_type: 'grass', tileset: SHEET, col: i, row: 1, role: 'edge', side,
  })),
  ...(['NE', 'NW', 'SE', 'SW'] as const).map((side, i) => ({
    tile_type: 'grass', tileset: SHEET, col: i, row: 2, role: 'corner', side,
  })),
]
const DIRT_EDGE_ART = (['N', 'S', 'E', 'W'] as const).map((side, i) => ({
  tile_type: 'dirt', tileset: SHEET, col: i, row: 3, role: 'edge', side,
}))

const catalog = (extra: object[] = []) =>
  makeCatalog(
    [{ type: 'road' }, { type: 'dirt', autotiled: true }, { type: 'grass', autotiled: true }],
    { tilesets: [{ name: SHEET, cell: 32, cols: 8 }], tiles: [...FILLS, ...GRASS_ART, ...extra] as never },
  )

const source = (terrain: Array<Array<string | null>>): SourceMap => ({
  slug: 's', title: 'S', cols: terrain[0].length, rows: terrain.length, terrain,
})

const frames = (cell: ReadonlyArray<{ frame: number }>) => cell.map((l) => l.frame)

describe('road under-spill', () => {
  // One road cell in a grass field: every grass neighbour — the diagonal-only
  // corners included — carries a road fill at road's depth beneath its own art.
  const baked = bakeGround(
    source([
      [G, G, G],
      [G, R, G],
      [G, G, G],
    ]),
    catalog(),
  )

  it('lays road fill beneath every painted 8-neighbour', () => {
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]]) {
      const road = baked.cells[y][x].filter((l) => l.frame === ROAD_FILL)
      expect(road, `cell ${x},${y}`).toHaveLength(1)
      expect(road[0].depth).toBe(0)
    }
  })

  it('bakes the road cell itself exactly once', () => {
    expect(frames(baked.cells[1][1])).toEqual([ROAD_FILL])
  })

  it('does not spill into unpainted cells', () => {
    const withHole = bakeGround(source([[_, R]]), catalog())
    expect(withHole.cells[0][0]).toEqual([])
  })

  it('keeps the diagonal-only grass corner covered beneath its opaque fill', () => {
    // (0,0) touches road only at its SE diagonal: no grass border, so the cell
    // is a flat grass fill — with the road base beneath, as the runtime painted.
    expect(frames(baked.cells[0][0])).toEqual([ROAD_FILL, GRASS_FILL])
  })
})

describe('dirt mask beneath grass', () => {
  const baked = bakeGround(
    source([
      [G, G, G],
      [G, D, G],
      [G, G, G],
    ]),
    catalog(),
  )

  it('lays a flat dirt fill under every grass 8-neighbour when dirt has no edge art', () => {
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [2, 2]]) {
      const dirt = baked.cells[y][x].filter((l) => l.frame === DIRT_FILL)
      expect(dirt, `cell ${x},${y}`).toHaveLength(1)
      expect(dirt[0].depth).toBeCloseTo(0.1)
    }
  })

  it('does not duplicate the mask as coverage backing under a grass edge', () => {
    // (1,0) borders dirt to its S: the grass S-edge tile draws over the mask —
    // one dirt layer, not mask + coverage.
    const cell = baked.cells[0][1]
    expect(cell.filter((l) => l.frame === DIRT_FILL)).toHaveLength(1)
    expect(frames(cell)).toContain(GRASS_EDGE.S)
  })

  it('never absorbs road into the mask', () => {
    const rd = bakeGround(source([[R, D, G]]), catalog())
    // The road cell carries only its own fill; the dirt cell sits on the road
    // under-spill; the grass cell sits on the dirt mask with its W edge.
    expect(frames(rd.cells[0][0])).toEqual([ROAD_FILL])
    expect(frames(rd.cells[0][1])).toEqual([ROAD_FILL, DIRT_FILL])
    expect(frames(rd.cells[0][2])).toEqual([DIRT_FILL, GRASS_EDGE.W])
  })
})

describe('dirt autotiling against the mask boundary', () => {
  it('draws dirt edge tiles where the mask ends, once dirt edge art exists', () => {
    const baked = bakeGround(
      source([
        [G, G, G],
        [G, D, G],
        [G, G, G],
      ]),
      catalog(DIRT_EDGE_ART),
    )
    // The mask covers the whole 3×3, so its boundary is the map border: the
    // top-middle cell ends the mask northward only.
    const topMid = baked.cells[0][1]
    expect(frames(topMid)).toContain(DIRT_EDGE.N)
    expect(frames(topMid)).not.toContain(DIRT_FILL)
    // The dirt cell itself is mask-interior on all sides: flat fill.
    expect(frames(baked.cells[1][1])).toEqual([DIRT_FILL])
  })
})
