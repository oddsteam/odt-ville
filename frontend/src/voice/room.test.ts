// The meeting-room resolver (#486): which voice room does a tile put you in?
// Pure and game-independent — it is handed plain rects, never the map or the
// scene (arch rule voice-depends-only-on-shared-infrastructure).

import { describe, expect, it } from 'vitest'
import { meetingRectsOf, resolveRoom, type MeetingRect } from './room.ts'
import type { Zone } from '../kernel/schema.ts'

const PROX = 'map-town'
const rect = (x: number, y: number, roomId: string, w?: number, h?: number): MeetingRect => ({
  x,
  y,
  w,
  h,
  roomId,
})

describe('resolveRoom (#486)', () => {
  it('returns the proximity room when there are no rects', () => {
    expect(resolveRoom({ x: 3, y: 4 }, [], PROX)).toBe(PROX)
  })

  it('returns the proximity room when the tile is outside every rect', () => {
    expect(resolveRoom({ x: 0, y: 0 }, [rect(5, 5, 'standup', 2, 2)], PROX)).toBe(PROX)
  })

  it('returns the meeting room key when the tile is inside a rect', () => {
    expect(resolveRoom({ x: 6, y: 6 }, [rect(5, 5, 'standup', 3, 3)], PROX)).toBe('meeting-standup')
  })

  it('treats a rect as half-open — the far edge is outside', () => {
    const rects = [rect(5, 5, 'standup', 2, 2)] // covers x,y in {5,6}
    expect(resolveRoom({ x: 5, y: 5 }, rects, PROX)).toBe('meeting-standup') // near corner in
    expect(resolveRoom({ x: 7, y: 5 }, rects, PROX)).toBe(PROX) // x == 5+2, outside
    expect(resolveRoom({ x: 5, y: 7 }, rects, PROX)).toBe(PROX) // y == 5+2, outside
  })

  it('defaults an absent w/h to a single tile', () => {
    const rects = [rect(4, 4, 'nook')] // one tile at (4,4)
    expect(resolveRoom({ x: 4, y: 4 }, rects, PROX)).toBe('meeting-nook')
    expect(resolveRoom({ x: 5, y: 4 }, rects, PROX)).toBe(PROX)
  })

  it('is deterministic under overlap — the first matching rect wins', () => {
    const rects = [rect(0, 0, 'first', 4, 4), rect(2, 2, 'second', 4, 4)]
    expect(resolveRoom({ x: 3, y: 3 }, rects, PROX)).toBe('meeting-first')
  })
})

describe('meetingRectsOf (#486)', () => {
  const meeting = (x: number, y: number, roomId: string, w?: number, h?: number): Zone => ({
    trigger: 'on_enter',
    x,
    y,
    w,
    h,
    payload: { kind: 'meeting', roomId },
  })

  it('is empty for an undefined zones array', () => {
    expect(meetingRectsOf(undefined)).toEqual([])
  })

  it('keeps only meeting zones, carrying their geometry and roomId', () => {
    const zones: Zone[] = [
      meeting(5, 5, 'standup', 3, 2),
      { trigger: 'on_enter', x: 0, y: 0, payload: { kind: 'encounter', pool: 'grass' } },
    ]
    expect(meetingRectsOf(zones)).toEqual([{ x: 5, y: 5, w: 3, h: 2, roomId: 'standup' }])
  })
})
