import { describe, expect, it } from 'vitest'

import {
  HOMETOWN_CATALOG,
  coverageTerrainForCell,
  groundPaintStackForCell,
  terrainBorders,
} from '../src/kernel/groundModel.js'
import { makeCatalog } from '../src/kernel/tileCatalog.ts'

// A terrain field over a raw grid — the generic accessor the engine resolves
// against (out-of-bounds is null, like an authored map's edge).
function field(grid: (string | null)[][]) {
  return {
    terrainAt: (x: number, y: number): string | null =>
      y < 0 || y >= grid.length || x < 0 || x >= grid[0].length ? null : grid[y][x],
  }
}

// grass (top) over dirt over road, exactly as the hometown stacks them.
const GRID = field([
  ['grass', 'grass', 'grass'],
  ['grass', 'dirt', 'grass'],
  ['road', 'dirt', 'grass'],
])

describe('layered-priority autotiling (catalog data)', () => {
  it('the higher-priority terrain owns the seam', () => {
    // The grass cell north of dirt edges toward it; the dirt cell stays fill
    // toward grass (grass, ranked higher, owns that seam).
    expect(terrainBorders(GRID, 1, 0, 'grass')).toEqual({ N: false, S: true, E: false, W: false })
    expect(terrainBorders(GRID, 1, 1, 'dirt')).toEqual({ N: false, S: false, E: false, W: false })
  })

  it('coverage is the highest applicable lower terrain', () => {
    // The grass cell at (1,1)'s south neighbour is dirt and west is grass; the
    // backing beneath its transparent edge is dirt.
    expect(coverageTerrainForCell(GRID, 1, 1, 'grass')).toBe('dirt')
  })

  it('resolves a fill cell to one opaque layer', () => {
    expect(groundPaintStackForCell(GRID, 1, 1, null)).toEqual([
      { terrain: 'dirt', role: 'fill', opaque: true, depth: 0.1 },
    ])
  })

  it('resolves a seam cell to a coverage fill beneath a transparent edge', () => {
    expect(groundPaintStackForCell(GRID, 1, 0, null)).toEqual([
      { terrain: 'dirt', role: 'coverage', opaque: true, depth: 0.1 },
      { terrain: 'grass', role: 'edge', opaque: false, depth: 0.2 },
    ])
  })
})

describe('parity: explicit catalog data == the default (hardcoded) behaviour', () => {
  // The same stack + autotiled set, but constructed purely from data.
  const dataCatalog = makeCatalog([
    { type: 'road' },
    { type: 'dirt', autotiled: true },
    { type: 'grass', autotiled: true },
  ])

  it('produces identical resolution for every cell', () => {
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(groundPaintStackForCell(GRID, x, y, null, dataCatalog)).toEqual(
          groundPaintStackForCell(GRID, x, y, null, HOMETOWN_CATALOG),
        )
      }
    }
  })
})

describe('a new terrain via catalog data needs no engine change', () => {
  // water sits on top of grass; the engine has never heard of it.
  const withWater = makeCatalog([
    { type: 'road' },
    { type: 'dirt', autotiled: true },
    { type: 'grass', autotiled: true },
    { type: 'water', autotiled: true },
  ])
  const wgrid = field([
    ['grass', 'grass'],
    ['water', 'grass'],
  ])

  it('the new top terrain owns its seam against grass', () => {
    // water edges toward the grass to its north and east; grass stays fill
    // toward water (water, ranked higher, owns those seams).
    expect(terrainBorders(wgrid, 0, 1, 'water', withWater)).toEqual({
      N: true,
      S: false,
      E: true,
      W: false,
    })
    expect(groundPaintStackForCell(wgrid, 0, 1, null, withWater)).toEqual([
      { terrain: 'grass', role: 'coverage', opaque: true, depth: 2 * 0.1 },
      { terrain: 'water', role: 'edge', opaque: false, depth: 3 * 0.1 },
    ])
    // The grass neighbour is plain fill — it does not own the water seam.
    expect(groundPaintStackForCell(wgrid, 0, 0, null, withWater)).toEqual([
      { terrain: 'grass', role: 'fill', opaque: true, depth: 0.2 },
    ])
  })
})
