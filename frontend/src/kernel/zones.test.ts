// The Zone primitive (#85, ADR-0004/0005): zones ride the baked map document
// with a closed trigger enum and a payload union keyed by `kind`, and the pure
// detector turns an avatar step into `on_enter` events — edge-triggered, so no
// fire while standing inside and none outside.

import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { BakedMap, type Zone } from './schema.ts'
import { interactZoneEvents, sightZoneEvents, zoneEvents } from './zones.ts'

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

  it('decodes a sight cone’s facing and range (#86)', () => {
    const map = decode({
      ...baseMap,
      zones: [
        {
          trigger: 'on_sight',
          x: 1,
          y: 1,
          facing: 'left',
          range: 3,
          payload: { kind: 'link', url: 'https://d.x' },
        },
      ],
    })
    expect(map.zones?.[0]).toMatchObject({ trigger: 'on_sight', facing: 'left', range: 3 })
  })

  it('rejects an unknown facing (closed enum)', () => {
    expect(() =>
      decode({
        ...baseMap,
        zones: [
          { trigger: 'on_sight', x: 0, y: 0, facing: 'sideways', payload: { kind: 'link', url: 'https://d.x' } },
        ],
      }),
    ).toThrow()
  })

  it('rejects a sight cone with no facing — a blind trainer is not a thing', () => {
    expect(() =>
      decode({
        ...baseMap,
        zones: [{ trigger: 'on_sight', x: 0, y: 0, range: 3, payload: { kind: 'link', url: 'https://d.x' } }],
      }),
    ).toThrow()
  })

  it('still decodes a portal with no facing (only on_sight aims)', () => {
    const map = decode({
      ...baseMap,
      zones: [{ trigger: 'on_enter', x: 1, y: 1, payload: { kind: 'portal', targetNode: 'plaza' } }],
    })
    expect(map.zones?.[0].trigger).toBe('on_enter')
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

// A trainer at (5,3) looking down, seeing 3 tiles: (5,4) (5,5) (5,6).
const sightZone: Zone = {
  trigger: 'on_sight',
  x: 5,
  y: 3,
  facing: 'down',
  range: 3,
  payload: { kind: 'link', url: 'https://duel.x' },
}

describe('sightZoneEvents (the trainer sight cone, #86)', () => {
  it('fires when a step crosses into the cone', () => {
    expect(sightZoneEvents({ x: 4, y: 4 }, { x: 5, y: 4 }, [sightZone])).toEqual([
      { trigger: 'on_sight', zone: sightZone },
    ])
  })

  it('sees to the far end of its range', () => {
    expect(sightZoneEvents({ x: 4, y: 6 }, { x: 5, y: 6 }, [sightZone])).toHaveLength(1)
  })

  it('does not see past its range', () => {
    expect(sightZoneEvents({ x: 4, y: 7 }, { x: 5, y: 7 }, [sightZone])).toEqual([])
  })

  it('respects facing: no fire behind the trainer', () => {
    expect(sightZoneEvents({ x: 4, y: 2 }, { x: 5, y: 2 }, [sightZone])).toEqual([])
  })

  it('does not fire when adjacent but outside the cone', () => {
    expect(sightZoneEvents({ x: 3, y: 4 }, { x: 4, y: 4 }, [sightZone])).toEqual([])
  })

  it('does not fire on the trainer’s own tile', () => {
    expect(sightZoneEvents({ x: 4, y: 3 }, { x: 5, y: 3 }, [sightZone])).toEqual([])
  })

  it('does not re-fire while moving within the cone', () => {
    expect(sightZoneEvents({ x: 5, y: 4 }, { x: 5, y: 5 }, [sightZone])).toEqual([])
  })

  it('never fires a zone that is not on_sight', () => {
    expect(sightZoneEvents({ x: 1, y: 2 }, { x: 2, y: 2 }, [enterZone])).toEqual([])
  })

  // A facing-less cone needs no runtime guard: the schema union makes it
  // unrepresentable, covered by the decode test above.

  it('sees one tile ahead when no range is authored', () => {
    const near: Zone = { ...sightZone, range: undefined }
    expect(sightZoneEvents({ x: 4, y: 4 }, { x: 5, y: 4 }, [near])).toHaveLength(1)
    expect(sightZoneEvents({ x: 4, y: 5 }, { x: 5, y: 5 }, [near])).toEqual([])
  })

  it('handles maps with no zones', () => {
    expect(sightZoneEvents({ x: 0, y: 0 }, { x: 1, y: 0 }, undefined)).toEqual([])
  })
})

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

describe('interactZoneEvents (the key-press detector, #110)', () => {
  it('fires when standing on the zone', () => {
    const events = interactZoneEvents({ x: 4, y: 4 }, { x: 4, y: 5 }, [interactZone])
    expect(events).toEqual([{ trigger: 'interact', zone: interactZone }])
  })

  it('fires when facing the zone from an adjacent tile', () => {
    const events = interactZoneEvents({ x: 3, y: 4 }, { x: 4, y: 4 }, [interactZone])
    expect(events).toEqual([{ trigger: 'interact', zone: interactZone }])
  })

  it('does not fire when adjacent but facing away', () => {
    expect(interactZoneEvents({ x: 3, y: 4 }, { x: 2, y: 4 }, [interactZone])).toEqual([])
  })

  it('never fires an on_enter zone (press is not a step)', () => {
    expect(interactZoneEvents({ x: 2, y: 2 }, { x: 3, y: 2 }, [enterZone])).toEqual([])
  })

  it('fires once when standing on and facing the same w×h zone', () => {
    const wide: Zone = { ...interactZone, w: 2 }
    expect(interactZoneEvents({ x: 4, y: 4 }, { x: 5, y: 4 }, [wide])).toHaveLength(1)
  })

  it('handles maps with no zones', () => {
    expect(interactZoneEvents({ x: 0, y: 0 }, { x: 1, y: 0 }, undefined)).toEqual([])
  })
})
