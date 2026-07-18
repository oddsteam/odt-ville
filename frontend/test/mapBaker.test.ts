import { describe, expect, it } from 'vitest'

import { bakeGround, bakeSourceMap } from '../src/kernel/baker.ts'
import type { SourceMap } from '../src/kernel/baker.ts'
import { groundDrawList } from '../src/kernel/mapRenderer.ts'
import { makeCatalog } from '../src/kernel/tileCatalog.ts'
import type { TileCatalog } from '../src/kernel/tileCatalog.ts'
import { MEADOW_CATALOG, MEADOW_SOURCE } from '../src/maps/fixtures/meadow.ts'

// Frame math is row * cols + col; the meadow sheet declares 32 columns.
const f = (col: number, row: number) => row * 32 + col

describe('bakeGround', () => {
  it('bakes a source grid to the same dimensions', () => {
    const g = bakeGround(MEADOW_SOURCE, MEADOW_CATALOG)
    expect(g.cols).toBe(5)
    expect(g.rows).toBe(4)
    expect(g.cells).toHaveLength(4)
    expect(g.cells[0]).toHaveLength(5)
  })

  it('bakes plain interior grass to one fill layer', () => {
    const g = bakeGround(MEADOW_SOURCE, MEADOW_CATALOG)
    // (1,0): grass with no lower-terrain neighbour -> a single grass fill.
    expect(g.cells[0][1]).toEqual([{ tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: f(2, 0), depth: 0.2 }])
  })

  it('owns the grass/dirt seam from the grass side: dirt coverage + grass edge', () => {
    const g = bakeGround(MEADOW_SOURCE, MEADOW_CATALOG)
    // (1,1): grass directly above the dirt path -> dirt coverage then grass S edge.
    expect(g.cells[1][1]).toEqual([
      { tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: f(1, 0), depth: 0.1 }, // dirt fill (coverage)
      { tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: f(2, 1), depth: 0.2 }, // grass S edge
    ])
  })

  it('leaves the lower terrain as plain fill — it never owns the seam', () => {
    const g = bakeGround(MEADOW_SOURCE, MEADOW_CATALOG)
    // (2,2): dirt in the path, grass above/below -> a single dirt fill.
    expect(g.cells[2][2]).toEqual([{ tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: f(1, 0), depth: 0.1 }])
  })

  it('only references the tilesets it actually used', () => {
    const g = bakeGround(MEADOW_SOURCE, MEADOW_CATALOG)
    expect(g.tilesets).toEqual([{ name: 'terrain/1_Terrains_and_Fences_32x32', cell: 32 }])
  })

  it('resolves a corner where the higher terrain meets a lower one on two sides', () => {
    const source: SourceMap = {
      slug: 's',
      title: 's',
      cols: 2,
      rows: 2,
      terrain: [
        ['grass', 'dirt'],
        ['dirt', 'dirt'],
      ],
    }
    const g = bakeGround(source, MEADOW_CATALOG)
    // (0,0): grass with dirt to the E and S -> dirt coverage + grass SE corner.
    expect(g.cells[0][0]).toEqual([
      { tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: f(1, 0), depth: 0.1 }, // dirt coverage
      { tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: f(3, 2), depth: 0.2 }, // grass SE corner
    ])
  })

  it('bakes a brand-new terrain introduced via catalog data — no code change', () => {
    const catalog: TileCatalog = makeCatalog(
      [{ type: 'grass', autotiled: true }, { type: 'water', autotiled: true }],
      {
        tilesets: [{ name: 'Aqua', cell: 16, cols: 8 }],
        tiles: [
          { tile_type: 'grass', tileset: 'Aqua', col: 0, row: 0, role: 'fill', side: null },
          { tile_type: 'water', tileset: 'Aqua', col: 1, row: 0, role: 'fill', side: null },
        ],
      },
    )
    const source: SourceMap = { slug: 'w', title: 'w', cols: 1, rows: 1, terrain: [['water']] }
    const g = bakeGround(source, catalog)
    expect(g.cells[0][0]).toEqual([{ tileset: 'Aqua', frame: 1, depth: 0.1 }])
  })
})

describe('bakeSourceMap (save path)', () => {
  it('persists both the source and the baked artifact', () => {
    const doc = bakeSourceMap(MEADOW_SOURCE, MEADOW_CATALOG)
    expect(doc.source).toBe(MEADOW_SOURCE)
    expect(doc.baked.slug).toBe('meadow')
    expect(doc.baked.ground.cells).toHaveLength(4)
  })
})

describe('groundDrawList (runtime render, no autotiling)', () => {
  it('flattens every baked layer to a draw with its depth', () => {
    const g = bakeGround(MEADOW_SOURCE, MEADOW_CATALOG)
    const draws = groundDrawList(g)
    // (1,1) contributed two layers (coverage + edge); they keep their depths.
    const at11 = draws.filter((d) => d.x === 1 && d.y === 1)
    expect(at11).toEqual([
      { x: 1, y: 1, key: 'bake.terrain/1_Terrains_and_Fences_32x32', frame: f(1, 0), depth: 0.1 },
      { x: 1, y: 1, key: 'bake.terrain/1_Terrains_and_Fences_32x32', frame: f(2, 1), depth: 0.2 },
    ])
  })
})
