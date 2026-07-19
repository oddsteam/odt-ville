// Pins the zone-authoring model (#90, ADR-0005): the decorate editor places
// Zones — trigger + payload regions — next to Props. Placement seeds a 1×1
// zone with the kind's default trigger and a payload that saves cleanly;
// lookup/erase hit any cell of a zone's w×h rect, topmost (last placed) first.

import { describe, expect, it } from 'vitest'
import { newZone, zoneIndexAt, eraseZoneAt, replaceZone } from './zoneAuthor.ts'
import type { Zone } from '../kernel/schema.ts'

describe('newZone', () => {
  it('seeds a portal as an on_enter door to the reserved town node', () => {
    expect(newZone('portal', 2, 3)).toEqual({
      trigger: 'on_enter',
      x: 2,
      y: 3,
      payload: { kind: 'portal', targetNode: 'town' },
    })
  })

  it('seeds a link as press-to-open', () => {
    expect(newZone('link', 0, 0)).toEqual({
      trigger: 'interact',
      x: 0,
      y: 0,
      payload: { kind: 'link', url: '' },
    })
  })
})

describe('zoneIndexAt', () => {
  const zones: Zone[] = [
    { trigger: 'on_enter', x: 1, y: 1, w: 2, h: 2, payload: { kind: 'portal', targetNode: 'town' } },
    { trigger: 'interact', x: 2, y: 2, payload: { kind: 'link', url: 'https://x' } },
  ]

  it('hits any cell of the w×h rect, absent w/h meaning one tile', () => {
    expect(zoneIndexAt(zones, 1, 2)).toBe(0)
    expect(zoneIndexAt(zones, 3, 3)).toBe(-1)
  })

  it('prefers the topmost (last placed) zone where rects overlap', () => {
    expect(zoneIndexAt(zones, 2, 2)).toBe(1)
  })
})

describe('eraseZoneAt', () => {
  const zones: Zone[] = [
    { trigger: 'on_enter', x: 0, y: 0, w: 2, h: 1, payload: { kind: 'portal', targetNode: 'town' } },
  ]

  it('removes the zone covering the cell', () => {
    expect(eraseZoneAt(zones, 1, 0)).toEqual([])
  })

  it('is a no-op off every zone (returns the input)', () => {
    expect(eraseZoneAt(zones, 5, 5)).toBe(zones)
  })
})

describe('replaceZone', () => {
  it('swaps the zone at the index, leaving the rest', () => {
    const zones: Zone[] = [
      { trigger: 'on_enter', x: 0, y: 0, payload: { kind: 'portal', targetNode: 'town' } },
      { trigger: 'interact', x: 4, y: 4, payload: { kind: 'link', url: '' } },
    ]
    const edited: Zone = { ...zones[1], payload: { kind: 'link', url: 'https://odds.team' } }
    expect(replaceZone(zones, 1, edited)).toEqual([zones[0], edited])
  })
})
