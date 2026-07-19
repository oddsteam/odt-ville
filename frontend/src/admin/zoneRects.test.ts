// The zones overlay's rects (#256): the anchor rect per zone, plus the sight
// cone of the selected `on_sight` zone so an author aims with feedback.

import { describe, expect, it } from 'vitest'
import type { Zone } from '../kernel/schema.ts'
import { zoneRects, ZONE_COLORS } from './zoneRects.ts'

const portal: Zone = {
  trigger: 'on_enter',
  x: 1,
  y: 1,
  payload: { kind: 'portal', targetNode: 'plaza' },
}
// A trainer at (5,3) looking down, seeing 2 tiles: (5,4) (5,5).
const trainer: Zone = {
  trigger: 'on_sight',
  x: 5,
  y: 3,
  facing: 'down',
  range: 2,
  payload: { kind: 'link', url: 'https://duel.x' },
}

describe('zoneRects', () => {
  it('draws one anchor rect per zone, marking the selected one', () => {
    expect(zoneRects([portal], 0)).toEqual([
      { x: 1, y: 1, w: 1, h: 1, color: ZONE_COLORS.portal, label: 'portal', selected: true },
    ])
  })

  it('honours an authored footprint', () => {
    const wide: Zone = { ...portal, w: 3, h: 2 }
    expect(zoneRects([wide], null)[0]).toMatchObject({ w: 3, h: 2, selected: false })
  })

  it('adds a 1×1 cone cell per sighted tile when the sight zone is selected', () => {
    expect(zoneRects([trainer], 0).slice(1)).toEqual([
      { x: 5, y: 4, w: 1, h: 1, color: ZONE_COLORS.link, label: '', selected: false },
      { x: 5, y: 5, w: 1, h: 1, color: ZONE_COLORS.link, label: '', selected: false },
    ])
  })

  it('hides the cone when the sight zone is not selected, so several trainers stay readable', () => {
    expect(zoneRects([trainer, portal], 1)).toHaveLength(2)
  })

  it('leaves non-aiming zones without a cone', () => {
    expect(zoneRects([portal], 0)).toHaveLength(1)
  })

  it('tints an encounter zone by its own kind, labelled by kind (#87)', () => {
    const grass: Zone = { trigger: 'on_enter', x: 2, y: 2, payload: { kind: 'encounter', pool: 'cave' } }
    expect(zoneRects([grass], null)).toEqual([
      { x: 2, y: 2, w: 1, h: 1, color: ZONE_COLORS.encounter, label: 'encounter', selected: false },
    ])
  })
})
