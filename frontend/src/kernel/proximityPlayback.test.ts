// Proximity playback (#438, ADR-0019): the avatar's distance — not the clock —
// drives an animated object's playhead. Forward while they are near, reverse
// once they leave, held at either end. Pure, so the decision is testable
// without booting Phaser.

import { describe, expect, it } from 'vitest'
import {
  PROXIMITY_RANGE_TILES,
  advancePlayhead,
  swingDirection,
} from './proximityPlayback.ts'

const door = { x: 10, y: 10 }

describe('swingDirection', () => {
  it('opens while the avatar stands on the object', () => {
    expect(swingDirection(door, door)).toBe(1)
  })

  it('opens at exactly the trigger distance', () => {
    expect(swingDirection({ x: 10 + PROXIMITY_RANGE_TILES, y: 10 }, door)).toBe(1)
    expect(swingDirection({ x: 10, y: 10 - PROXIMITY_RANGE_TILES }, door)).toBe(1)
  })

  it('closes one tile beyond it', () => {
    expect(swingDirection({ x: 10 + PROXIMITY_RANGE_TILES + 1, y: 10 }, door)).toBe(-1)
  })

  it('triggers over a square region, so a diagonal corner is still in range', () => {
    const corner = { x: 10 + PROXIMITY_RANGE_TILES, y: 10 + PROXIMITY_RANGE_TILES }
    expect(swingDirection(corner, door)).toBe(1)
  })

  it('takes an explicit range over the default', () => {
    expect(swingDirection({ x: 12, y: 10 }, door, 1)).toBe(-1)
  })
})

// 5 frames at 10fps: one frame per 100ms, last frame index 4.
const swing = { fps: 10, frameCount: 5 }

describe('advancePlayhead', () => {
  it('advances by fps × elapsed while opening', () => {
    expect(advancePlayhead(0, 1, { ...swing, deltaMs: 100 })).toBeCloseTo(1)
    expect(advancePlayhead(1, 1, { ...swing, deltaMs: 50 })).toBeCloseTo(1.5)
  })

  it('holds open at the last frame rather than looping', () => {
    expect(advancePlayhead(4, 1, { ...swing, deltaMs: 1000 })).toBe(4)
  })

  it('holds shut at frame 0 rather than running backwards', () => {
    expect(advancePlayhead(0, -1, { ...swing, deltaMs: 1000 })).toBe(0)
  })

  it('reverses from where it is, with no snap', () => {
    const mid = advancePlayhead(0, 1, { ...swing, deltaMs: 250 })
    expect(mid).toBeCloseTo(2.5)
    expect(advancePlayhead(mid, -1, { ...swing, deltaMs: 100 })).toBeCloseTo(1.5)
  })

  it('cannot overshoot an end on one long frame', () => {
    expect(advancePlayhead(3.5, 1, { ...swing, deltaMs: 5000 })).toBe(4)
    expect(advancePlayhead(0.5, -1, { ...swing, deltaMs: 5000 })).toBe(0)
  })
})
