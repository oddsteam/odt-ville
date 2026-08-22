// The meeting-room resolver (#486): which voice room does a tile put you in?
// Pure and game-independent — it reads the map's authored zones as plain data,
// never the map or the scene (arch rule voice-depends-only-on-shared-infrastructure).

import { describe, expect, it } from 'vitest'
import { resolveRoom } from './room.ts'
import type { Zone } from '../kernel/schema.ts'

const PROX = 'map-town'
// A meeting zone anchored at (x,y) over a w×h footprint, naming its room.
const meeting = (x: number, y: number, roomId: string, w?: number, h?: number): Zone => ({
  trigger: 'on_enter',
  x,
  y,
  w,
  h,
  payload: { kind: 'meeting', roomId },
})

describe('resolveRoom (#486)', () => {
  it('returns the proximity room when there are no zones', () => {
    expect(resolveRoom({ x: 3, y: 4 }, [], PROX)).toBe(PROX)
  })

  it('returns the proximity room for an undefined zones array', () => {
    expect(resolveRoom({ x: 3, y: 4 }, undefined, PROX)).toBe(PROX)
  })

  it('returns the proximity room when the tile is outside every meeting zone', () => {
    expect(resolveRoom({ x: 0, y: 0 }, [meeting(5, 5, 'standup', 2, 2)], PROX)).toBe(PROX)
  })

  it('returns the meeting room key when the tile is inside a meeting zone', () => {
    expect(resolveRoom({ x: 6, y: 6 }, [meeting(5, 5, 'standup', 3, 3)], PROX)).toBe('meeting-standup')
  })

  it('ignores non-meeting zones covering the tile', () => {
    const zones: Zone[] = [
      { trigger: 'on_enter', x: 5, y: 5, w: 3, h: 3, payload: { kind: 'encounter', pool: 'grass' } },
    ]
    expect(resolveRoom({ x: 6, y: 6 }, zones, PROX)).toBe(PROX)
  })

  it('treats a zone as half-open — the far edge is outside', () => {
    const zones = [meeting(5, 5, 'standup', 2, 2)] // covers x,y in {5,6}
    expect(resolveRoom({ x: 5, y: 5 }, zones, PROX)).toBe('meeting-standup') // near corner in
    expect(resolveRoom({ x: 7, y: 5 }, zones, PROX)).toBe(PROX) // x == 5+2, outside
    expect(resolveRoom({ x: 5, y: 7 }, zones, PROX)).toBe(PROX) // y == 5+2, outside
  })

  it('defaults an absent w/h to a single tile', () => {
    const zones = [meeting(4, 4, 'nook')] // one tile at (4,4)
    expect(resolveRoom({ x: 4, y: 4 }, zones, PROX)).toBe('meeting-nook')
    expect(resolveRoom({ x: 5, y: 4 }, zones, PROX)).toBe(PROX)
  })

  it('is deterministic under overlap — the first matching zone wins', () => {
    const zones = [meeting(0, 0, 'first', 4, 4), meeting(2, 2, 'second', 4, 4)]
    expect(resolveRoom({ x: 3, y: 3 }, zones, PROX)).toBe('meeting-first')
  })
})
