// The Zone primitive (#85, ADR-0004/0005): zones ride the baked map document
// with a closed trigger enum and a payload union keyed by `kind`, and the pure
// detector turns an avatar step into `on_enter` events — edge-triggered, so no
// fire while standing inside and none outside.

import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { BakedMap, type Zone } from './schema.ts'
import { zoneEvents } from './zones.ts'

const decode = Schema.decodeUnknownSync(BakedMap)

const baseMap = {
  slug: 'm',
  title: 'M',
  cols: 4,
  rows: 4,
  tilesets: [],
  tiles: [],
  entities: [],
}

describe('Zone in the map document', () => {
  it('decodes zones carrying a trigger and a payload', () => {
    const map = decode({
      ...baseMap,
      zones: [
        { trigger: 'on_enter', x: 1, y: 2, payload: { kind: 'portal', targetNode: 'plaza' } },
        { trigger: 'interact', x: 0, y: 0, w: 2, h: 1, payload: { kind: 'link', url: 'https://e.x', label: 'Board' } },
      ],
    })
    expect(map.zones?.[0].trigger).toBe('on_enter')
    expect(map.zones?.[0].payload.kind).toBe('portal')
    expect(map.zones?.[1].payload.kind).toBe('link')
  })

  it('rejects an unknown trigger (closed enum, not a bool)', () => {
    expect(() =>
      decode({
        ...baseMap,
        zones: [{ trigger: 'on_wink', x: 0, y: 0, payload: { kind: 'portal', targetNode: 'p' } }],
      }),
    ).toThrow()
  })

  it('omits zones on legacy maps', () => {
    expect(decode(baseMap).zones).toBeUndefined()
  })
})

const enterZone: Zone = {
  trigger: 'on_enter',
  x: 2,
  y: 2,
  w: 2,
  h: 1,
  payload: { kind: 'portal', targetNode: 'plaza' },
}
const interactZone: Zone = {
  trigger: 'interact',
  x: 4,
  y: 4,
  payload: { kind: 'link', url: 'https://e.x' },
}

describe('zoneEvents (the pure detector)', () => {
  it('fires on_enter when a step crosses into the zone', () => {
    const events = zoneEvents({ x: 1, y: 2 }, { x: 2, y: 2 }, [enterZone])
    expect(events).toEqual([{ trigger: 'on_enter', zone: enterZone }])
  })

  it('covers the full w×h rect', () => {
    expect(zoneEvents({ x: 3, y: 1 }, { x: 3, y: 2 }, [enterZone])).toHaveLength(1)
  })

  it('does not re-fire while moving inside the zone', () => {
    expect(zoneEvents({ x: 2, y: 2 }, { x: 3, y: 2 }, [enterZone])).toEqual([])
  })

  it('does not fire outside the zone (adjacent step)', () => {
    expect(zoneEvents({ x: 0, y: 2 }, { x: 1, y: 2 }, [enterZone])).toEqual([])
  })

  it('does not fire an interact zone on step (that is a key-press, #110)', () => {
    expect(zoneEvents({ x: 3, y: 4 }, { x: 4, y: 4 }, [interactZone])).toEqual([])
  })

  it('handles maps with no zones', () => {
    expect(zoneEvents({ x: 0, y: 0 }, { x: 1, y: 0 }, undefined)).toEqual([])
  })
})
