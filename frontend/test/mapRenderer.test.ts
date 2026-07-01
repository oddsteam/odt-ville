import { describe, expect, it } from 'vitest'

import { bakedDraws, bakedDrawList, bakedTextureKey } from '../src/game/phaser/mapRenderer.ts'
import type { BakedGround, BakedMap } from '../src/maps/schema.ts'

const map: BakedMap = {
  slug: 'atrium',
  title: 'The Atrium',
  cols: 2,
  rows: 2,
  tilesets: [{ name: 'Terra', cell: 32 }],
  tiles: [
    [
      { tileset: 'Terra', frame: 0 },
      { tileset: 'Terra', frame: 3 },
    ],
    [null, { tileset: 'Terra', frame: 7 }],
  ],
  entities: [{ kind: 'prop', tileset: 'Terra', frame: 12, x: 1, y: 0 }],
}

describe('bakedDrawList', () => {
  it('flattens baked cells to draw instructions at their grid coordinate', () => {
    const { tiles } = bakedDrawList(map)
    expect(tiles).toEqual([
      { x: 0, y: 0, key: bakedTextureKey('Terra'), frame: 0 },
      { x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 3 },
      { x: 1, y: 1, key: bakedTextureKey('Terra'), frame: 7 },
    ])
  })

  it('skips transparent (null) cells — no stamp where nothing was painted', () => {
    const { tiles } = bakedDrawList(map)
    // The (0,1) cell is null, so no draw instruction references it.
    expect(tiles.some((t) => t.x === 0 && t.y === 1)).toBe(false)
  })

  it('emits entities as their own stamps from the baked entity list', () => {
    const { entities } = bakedDrawList(map)
    expect(entities).toEqual([{ x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 12 }])
  })

  it('reads frames verbatim — no neighbour inspection / autotiling at runtime', () => {
    // Same terrain everywhere, but each baked frame differs; the draw list must
    // preserve the producer-resolved frames rather than recompute edges.
    const uniform: BakedMap = {
      ...map,
      tiles: [[{ tileset: 'Terra', frame: 9 }, { tileset: 'Terra', frame: 9 }]],
      cols: 2,
      rows: 1,
      entities: [],
    }
    const { tiles } = bakedDrawList(uniform)
    expect(tiles.map((t) => t.frame)).toEqual([9, 9])
  })
})

describe('bakedDraws', () => {
  it('draws flat tiles at depth 0 and entities above at depth 1', () => {
    expect(bakedDraws(map)).toEqual([
      { x: 0, y: 0, key: bakedTextureKey('Terra'), frame: 0, depth: 0 },
      { x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 3, depth: 0 },
      { x: 1, y: 1, key: bakedTextureKey('Terra'), frame: 7, depth: 0 },
      { x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 12, depth: 1 },
    ])
  })

  it('prefers the autotiled ground stacks (with their depths) over flat tiles', () => {
    const ground: BakedGround = {
      cols: 1,
      rows: 1,
      tilesets: [{ name: 'Terra', cell: 32 }],
      // one cell, two stacked layers — a coverage fill beneath an edge tile.
      cells: [[[
        { tileset: 'Terra', frame: 1, depth: 0.1 },
        { tileset: 'Terra', frame: 2, depth: 0.2 },
      ]]],
    }
    const painted: BakedMap = { ...map, ground, entities: [] }
    expect(bakedDraws(painted)).toEqual([
      { x: 0, y: 0, key: bakedTextureKey('Terra'), frame: 1, depth: 0.1 },
      { x: 0, y: 0, key: bakedTextureKey('Terra'), frame: 2, depth: 0.2 },
    ])
  })
})
