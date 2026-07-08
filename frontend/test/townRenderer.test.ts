import { describe, expect, it } from 'vitest'

import { tilesetColumns } from '../src/game/phaser/townRenderer.ts'

// The one piece of catalog data only known once images load: each sheet's
// column count, read off the texture (width / cell) for the producer bake's
// frame math (#171). Mirrors how the map editor reads the PNG.

const fakeScene = (groundTiles: unknown[], width = 64) =>
  ({
    _groundTiles: groundTiles,
    textures: {
      exists: () => true,
      get: () => ({ getSourceImage: () => ({ width }) }),
    },
  }) as never

describe('tilesetColumns', () => {
  it('derives each referenced sheet\'s column count from the loaded texture', () => {
    const cols = tilesetColumns(
      fakeScene([
        { tileset: 'Set', cell: 16 },
        { tileset: 'Set', cell: 16 }, // duplicate reference — read once
      ]),
    )
    expect(cols).toEqual({ Set: 4 }) // 64 px / 16 px cells
  })

  it('skips sheets whose texture never loaded', () => {
    const scene = {
      _groundTiles: [{ tileset: 'Missing', cell: 16 }],
      textures: { exists: () => false },
    } as never
    expect(tilesetColumns(scene)).toEqual({})
  })
})
