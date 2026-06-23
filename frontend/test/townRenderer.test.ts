import { describe, expect, it } from 'vitest'

import { buildEdgeMap, buildGroundTileMap } from '../src/game/phaser/townRenderer.ts'

// Fake textures manager: every key exists and its source image is `width` px
// wide, so the column count (width / cell) is predictable for the frame math.
const fakeScene = (groundTiles: unknown[], width = 64) =>
  ({
    _groundTiles: groundTiles,
    textures: {
      exists: () => true,
      get: () => ({ getSourceImage: () => ({ width }) }),
    },
  }) as never

const tile = (over: Record<string, unknown>) => ({
  tileset: 'Set',
  cell: 16,
  col: 0,
  row: 0,
  tile_type: 'grass',
  role: 'fill',
  side: null,
  ...over,
})

describe('buildGroundTileMap', () => {
  it('maps fill tiles onto their terrain chars with frame = row*cols + col', () => {
    // width 64 / cell 16 => 4 columns, so row 2 col 1 => frame 9.
    const map = buildGroundTileMap(
      fakeScene([
        tile({ tile_type: 'grass', col: 1, row: 2 }),
        tile({ tile_type: 'dirt', col: 0, row: 1 }),
        tile({ tile_type: 'road', col: 3, row: 0 }),
      ]),
    )
    expect(map['.']).toEqual({ key: 'gtset.Set', frame: 9 })
    expect(map['*']).toEqual({ key: 'gtset.Set', frame: 9 }) // grass covers '.' and '*'
    expect(map['g']).toEqual({ key: 'gtset.Set', frame: 4 })
    expect(map[':']).toEqual({ key: 'gtset.Set', frame: 3 })
  })

  it('ignores edge/corner tiles in the fill map', () => {
    const map = buildGroundTileMap(
      fakeScene([tile({ tile_type: 'grass', role: 'edge', side: 'N' })]),
    )
    expect(map['.']).toBeUndefined()
  })
})

describe('buildEdgeMap', () => {
  it('keys edge and corner tiles by terrain then side', () => {
    const edges = buildEdgeMap(
      fakeScene([
        tile({ tile_type: 'grass', role: 'edge', side: 'N', col: 1, row: 0 }),
        tile({ tile_type: 'grass', role: 'corner', side: 'NE', col: 2, row: 0 }),
        tile({ tile_type: 'grass', role: 'fill', col: 0, row: 0 }),
      ]),
    )
    expect(edges.grass.N).toEqual({ key: 'gtset.Set', frame: 1 })
    expect(edges.grass.NE).toEqual({ key: 'gtset.Set', frame: 2 })
    expect(edges.grass.fill).toBeUndefined()
  })
})
