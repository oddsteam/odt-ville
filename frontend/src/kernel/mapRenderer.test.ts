// The baked-map draw flattening (#168, the pure half of the fg_mask overlay
// slice). Pins that an entity whose object carries a foreground mask emits a
// second, mask-clipped draw instruction (fgMaskKey/fgDepth) above the base art,
// while art-only objects (and legacy tileset entities) stay single-depth — the
// Canvas fallback + stamping live in Phaser and are exercised by the scene.

import { describe, expect, it } from 'vitest'
import {
  bakedDraws,
  blinkRects,
  BLINK_DEPTH,
  MAP_ENTITY_DEPTH,
  MAP_ENTITY_FG_DEPTH,
  objectTextureKey,
  type ObjectArt,
} from './mapRenderer.ts'
import { objectForegroundKey } from './entityLoader.ts'
import type { BakedMap } from './schema.ts'
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
