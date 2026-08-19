// Pins the zone-authoring model (#90, ADR-0005): the decorate editor places
// Zones — trigger + payload regions — next to Props. Placement seeds a 1×1
// zone with the kind's default trigger and a payload that saves cleanly;
// lookup/erase hit any cell of a zone's w×h rect, topmost (last placed) first.

import { describe, expect, it } from 'vitest'
import { newZone, retrigger, triggersFor, zoneIndexAt, eraseZoneAt, replaceZone, previewMapOf } from './zoneAuthor.ts'
import type { BakedMap, Zone, ZonePayload } from '../kernel/schema.ts'

type MeetingPayload = Extract<ZonePayload, { kind: 'meeting' }>

describe('retrigger (the inspector’s trigger switch, #86)', () => {
  const portal: Zone = { trigger: 'on_enter', x: 1, y: 1, payload: { kind: 'portal', targetNode: 'town' } }
  const cone: Zone = {
    trigger: 'on_sight',
    x: 1,
    y: 1,
    facing: 'left',
    range: 4,
    payload: { kind: 'portal', targetNode: 'town' },
  }

  it('supplies a default facing when a zone starts aiming', () => {
    expect(retrigger(portal, 'on_sight')).toEqual({ ...portal, trigger: 'on_sight', facing: 'down' })
  })

  it('keeps the aim it already has rather than resetting it', () => {
    expect(retrigger(cone, 'on_sight')).toEqual(cone)
  })

  it('drops facing and range when a zone stops aiming', () => {
    expect(retrigger(cone, 'interact')).toEqual({
      trigger: 'interact',
      x: 1,
      y: 1,
      payload: { kind: 'portal', targetNode: 'town' },
    })
  })

  it('leaves a non-aiming switch alone', () => {
    expect(retrigger(portal, 'interact')).toEqual({ ...portal, trigger: 'interact' })
  })

  it('preserves the rect and payload across the switch', () => {
    const wide: Zone = { ...portal, w: 3, h: 2 }
    expect(retrigger(wide, 'on_sight')).toMatchObject({ w: 3, h: 2, payload: wide.payload })
  })
})

describe('newZone', () => {
  it('seeds a portal as an on_enter door to the reserved town node', () => {
    expect(newZone('portal', 2, 3)).toEqual({
      trigger: 'on_enter',
      x: 2,
      y: 3,
      payload: { kind: 'portal', targetNode: 'town' },
    })
  })

  it('seeds a trainer as an unset-npc on_enter zone the inspector then aims (#259)', () => {
    expect(newZone('trainer', 4, 5)).toEqual({
      trigger: 'on_enter',
      x: 4,
      y: 5,
      payload: { kind: 'trainer', npcId: 0 },
    })
  })

  it('seeds an encounter as an on_enter grass patch rolling the global pool (#87)', () => {
    expect(newZone('encounter', 6, 7)).toEqual({
      trigger: 'on_enter',
      x: 6,
      y: 7,
      payload: { kind: 'encounter', pool: '' },
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

  it('seeds a meeting as an on_enter room with a generated roomId that saves cleanly (#485)', () => {
    const zone = newZone('meeting', 8, 9)
    expect(zone).toMatchObject({ trigger: 'on_enter', x: 8, y: 9 })
    const payload = zone.payload as MeetingPayload
    expect(payload.kind).toBe('meeting')
    // Non-blank so the zone saves from the first click (the validator rejects a
    // blank roomId), and no label until the author types one.
    expect(payload.roomId).toMatch(/\S/)
    expect(payload.label).toBeUndefined()
  })

  it('gives each placed meeting room its own roomId, so moving one never strands the other (#485)', () => {
    const a = newZone('meeting', 0, 0).payload as MeetingPayload
    const b = newZone('meeting', 1, 1).payload as MeetingPayload
    expect(a.roomId).not.toEqual(b.roomId)
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

describe('triggersFor', () => {
  // An encounter is a stepped mechanic: the runtime rolls a wild when the
  // avatar walks onto the region. There is no press-to-roll and no roll across
  // a sight cone, so offering those triggers would author a zone that never
  // fires (#87).
  it('offers only on_enter for an encounter payload', () => {
    expect(triggersFor('encounter')).toEqual(['on_enter'])
  })

  // You are in a meeting room when you stand inside its rect (#486) — there is
  // no press-to-meet and no meet-across-a-cone, so on_enter is the only trigger
  // that can ever fire it (#485).
  it('offers only on_enter for a meeting payload', () => {
    expect(triggersFor('meeting')).toEqual(['on_enter'])
  })

  it('leaves the other kinds free to pick any trigger', () => {
    for (const kind of ['portal', 'link', 'trainer'] as const) {
      expect(triggersFor(kind)).toEqual(['on_enter', 'interact', 'on_sight'])
    }
  })
})

describe('previewMapOf (the live decorate preview, #493)', () => {
  const stale: Zone = { trigger: 'interact', x: 0, y: 0, payload: { kind: 'link', url: 'old' } }
  const baked: BakedMap = {
    slug: 'm',
    title: 'M',
    cols: 4,
    rows: 4,
    tilesets: [{ name: 'grass', cell: 16 }],
    tiles: [[{ tileset: 'grass', frame: 0 }]],
    zones: [stale],
    entities: [],
  }

  it('reflects the live zones, not the ones baked at load — a deleted zone is gone', () => {
    const kept: Zone = { trigger: 'interact', x: 2, y: 2, payload: { kind: 'link', url: 'kept' } }
    expect(previewMapOf(baked, [kept], []).zones).toEqual([kept])
    expect(previewMapOf(baked, [], []).zones).toEqual([]) // not baked.zones
  })

  it('carries the passed entities and keeps the rest of the baked map', () => {
    const entities: BakedMap['entities'] = [{ kind: 'prop', object_id: 1, x: 1, y: 1 }]
    const out = previewMapOf(baked, [], entities)
    expect(out.entities).toEqual(entities)
    expect(out.slug).toBe('m')
    expect(out.cols).toBe(4)
  })
})
