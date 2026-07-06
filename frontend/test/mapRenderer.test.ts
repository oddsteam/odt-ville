import { describe, expect, it } from 'vitest'

import { bakedDraws, bakedTextureKey, objectTextureKey } from '../src/game/phaser/mapRenderer.ts'
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

describe('bakedDraws', () => {
  it('flattens baked cells to draw instructions at their grid coordinate, flat tiles at depth 0', () => {
    const tiles = bakedDraws({ ...map, entities: [] })
    expect(tiles).toEqual([
      { x: 0, y: 0, key: bakedTextureKey('Terra'), frame: 0, depth: 0 },
      { x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 3, depth: 0 },
      { x: 1, y: 1, key: bakedTextureKey('Terra'), frame: 7, depth: 0 },
    ])
  })

  it('skips transparent (null) cells — no stamp where nothing was painted', () => {
    // The (0,1) cell is null, so no draw instruction references it.
    expect(bakedDraws({ ...map, entities: [] }).some((t) => t.x === 0 && t.y === 1)).toBe(false)
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
    expect(bakedDraws(uniform).map((t) => t.frame)).toEqual([9, 9])
  })

  it('draws entities above the flat tiles at depth 1', () => {
    expect(bakedDraws(map)).toEqual([
      { x: 0, y: 0, key: bakedTextureKey('Terra'), frame: 0, depth: 0 },
      { x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 3, depth: 0 },
      { x: 1, y: 1, key: bakedTextureKey('Terra'), frame: 7, depth: 0 },
      { x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 12, depth: 1, w: 1, h: 1 },
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

// Entity references to saved tile objects (#139, ADR-0008): the prop is
// `{kind:"prop", object_id, x, y}` and the fetched object supplies texture +
// footprint; a dangling reference (deleted object) draws nothing.
describe('bakedDraws object entities', () => {
  const bare = { ...map, tiles: [], entities: [] }

  it('stamps an object-reference prop at its footprint via obj.<id>', () => {
    const m = { ...bare, entities: [{ kind: 'prop', object_id: 7, x: 1, y: 0 }] }
    const objects = new Map([[7, { footprint_w: 2, footprint_h: 3 }]])
    expect(bakedDraws(m, objects)).toEqual([
      { x: 1, y: 0, key: objectTextureKey(7), frame: 0, depth: 1, w: 2, h: 3 },
    ])
  })

  it('skips a dangling object reference (deleted object)', () => {
    const m = { ...bare, entities: [{ kind: 'prop', object_id: 404, x: 1, y: 1 }] }
    expect(bakedDraws(m, new Map())).toEqual([])
  })
})
