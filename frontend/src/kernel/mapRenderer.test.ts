// The baked-map draw flattening (#168, the pure half of the fg_mask overlay
// slice). Pins that an entity whose object carries a foreground mask emits a
// second, mask-clipped draw instruction (fgMaskKey/fgDepth) above the base art,
// while art-only objects (and legacy tileset entities) stay single-depth — the
// Canvas fallback + stamping live in Phaser and are exercised by the scene.

import { describe, expect, it } from 'vitest'
import {
  bakedDraws,
  bakedTextureKey,
  blinkRects,
  BLINK_DEPTH,
  MAP_ENTITY_DEPTH,
  MAP_ENTITY_FG_DEPTH,
  objectTextureKey,
  type ObjectArt,
} from './mapRenderer.ts'
import { objectForegroundKey } from './entityLoader.ts'
import type { BakedGround, BakedMap } from './schema.ts'
import { TILE } from './constants.ts'

// A minimal 2×2 baked map with a single tile and the given entities.
const mapWith = (entities: BakedMap['entities']): BakedMap => ({
  slug: 'm',
  title: 'M',
  cols: 4,
  rows: 4,
  tilesets: [{ name: 'grass', cell: 16 }],
  tiles: [[{ tileset: 'grass', frame: 0 }]],
  entities,
})

const OBJECTS = new Map<number, ObjectArt>([
  [1, { footprint_w: 2, footprint_h: 2, fg_mask: 'data:image/png;base64,xxx' }],
  [2, { footprint_w: 1, footprint_h: 1, fg_mask: null }],
])

describe('bakedDraws fg overlay', () => {
  it('emits a mask-clipped overlay draw for an entity whose object has an fg_mask', () => {
    const draws = bakedDraws(mapWith([{ kind: 'prop', object_id: 1, x: 1, y: 1 }]), OBJECTS)
    const base = draws.find((d) => d.key === objectTextureKey(1))
    expect(base).toBeDefined()
    // The base art keeps the entity band; the overlay rides one depth above it.
    expect(base?.depth).toBeGreaterThanOrEqual(MAP_ENTITY_DEPTH)
    expect(base?.depth).toBeLessThan(MAP_ENTITY_DEPTH + 0.5)
    expect(base?.fgMaskKey).toBe(objectForegroundKey(1))
    expect(base?.fgDepth).toBe(MAP_ENTITY_FG_DEPTH)
    expect(base?.fgDepth).toBeGreaterThan(base?.depth ?? 0)
  })

  it('leaves art-only objects single-depth (no overlay)', () => {
    const draws = bakedDraws(mapWith([{ kind: 'prop', object_id: 2, x: 0, y: 0 }]), OBJECTS)
    const base = draws.find((d) => d.key === objectTextureKey(2))
    expect(base).toBeDefined()
    expect(base?.fgMaskKey).toBeUndefined()
    expect(base?.fgDepth).toBeUndefined()
  })

  it('carries ambient animation frames through for an animated prop (#85)', () => {
    // The billboard: a Prop the renderer animates entirely by itself — it is
    // not a Zone, so it never reaches the onZone channel.
    const draws = bakedDraws(
      mapWith([{ kind: 'prop', tileset: 't', frame: 3, frames: [3, 4], fps: 2, x: 1, y: 0 }]),
      OBJECTS,
    )
    const billboard = draws.find((d) => d.key === 'bake.t')
    expect(billboard?.frames).toEqual([3, 4])
    expect(billboard?.fps).toBe(2)
  })

  it('draws the prop whose footprint bottom is lower in front of one stacked above it', () => {
    // A 1×1 at (1,2) (bottom row 3) placed BEFORE a 2×2 at (0,0) (bottom row 2)
    // still draws in front: depth follows the footprint bottom, not stamp order.
    const draws = bakedDraws(
      mapWith([
        { kind: 'prop', object_id: 2, x: 1, y: 2 },
        { kind: 'prop', object_id: 1, x: 0, y: 0 },
      ]),
      OBJECTS,
    )
    const low = draws.find((d) => d.key === objectTextureKey(2))
    const high = draws.find((d) => d.key === objectTextureKey(1))
    expect(low?.depth).toBeGreaterThan(high?.depth ?? Infinity)
    expect(low?.depth).toBeLessThan(MAP_ENTITY_DEPTH + 0.5)
  })

  it('carries no overlay for legacy tileset entities', () => {
    const draws = bakedDraws(mapWith([{ kind: 'prop', tileset: 't', frame: 3, x: 0, y: 0 }]), OBJECTS)
    const entity = draws.find((d) => d.key === 'bake.t')
    expect(entity).toBeDefined()
    expect(entity?.fgMaskKey).toBeUndefined()
  })
})

// The blinking zone marker: only a zone the author ticked "blinking" on gets a
// ring, in world px, and the ring band sits wholly *outside* the zone's own
// rect so the object art it hides under is never tinted.
describe('blinkRects', () => {
  const link = (blink?: boolean, w?: number, h?: number) => ({
    trigger: 'interact' as const,
    x: 2,
    y: 3,
    w,
    h,
    payload: { kind: 'link' as const, url: 'https://odds.team', blink },
  })

  it('rings only the zones flagged blinking', () => {
    expect(blinkRects([link(false), link(undefined), link(true)])).toEqual([
      { x: 2 * TILE, y: 3 * TILE, w: TILE, h: TILE },
    ])
  })

  it('spans the zone rect for a multi-tile zone', () => {
    expect(blinkRects([link(true, 3, 2)])[0]).toEqual({
      x: 2 * TILE,
      y: 3 * TILE,
      w: 3 * TILE,
      h: 2 * TILE,
    })
  })

  it('draws under the object art', () => {
    expect(BLINK_DEPTH).toBeLessThan(MAP_ENTITY_DEPTH)
  })

  it('has nothing to draw on a map with no zones', () => {
    expect(blinkRects(undefined)).toEqual([])
  })
})

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

  it('draws entities above the flat tiles, in the entity band', () => {
    expect(bakedDraws(map)).toEqual([
      { x: 0, y: 0, key: bakedTextureKey('Terra'), frame: 0, depth: 0 },
      { x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 3, depth: 0 },
      { x: 1, y: 1, key: bakedTextureKey('Terra'), frame: 7, depth: 0 },
      // Independent literal, not entityDepth(0, 1): pin the number the formula
      // must produce so a stale/duplicated module can't match itself (#534).
      { x: 1, y: 0, key: bakedTextureKey('Terra'), frame: 12, depth: 1.001, w: 1, h: 1 },
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
      { x: 1, y: 0, key: objectTextureKey(7), frame: 0, depth: 1.003, w: 2, h: 3 },
    ])
  })

  it('skips a dangling object reference (deleted object)', () => {
    const m = { ...bare, entities: [{ kind: 'prop', object_id: 404, x: 1, y: 1 }] }
    expect(bakedDraws(m, new Map())).toEqual([])
  })
})
