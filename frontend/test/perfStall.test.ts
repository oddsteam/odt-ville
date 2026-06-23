import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STALL_THRESHOLD_MS,
  DEFAULT_STALLS_TO_FIRE,
  initialPerfStallState,
  observeFrame,
} from '../src/game/phaser/perfStall.ts'

describe('observeFrame', () => {
  it('ignores frames under the stall threshold', () => {
    const s = initialPerfStallState()
    const r = observeFrame(s, DEFAULT_STALL_THRESHOLD_MS - 1)
    expect(r.fire).toBe(false)
    expect(r.state.count).toBe(0)
    expect(r.state.fired).toBe(false)
  })

  it('treats a delta exactly at the threshold as not-a-stall', () => {
    const s = initialPerfStallState()
    const r = observeFrame(s, DEFAULT_STALL_THRESHOLD_MS)
    expect(r.fire).toBe(false)
    expect(r.state.count).toBe(0)
  })

  it('counts a stall when delta exceeds the threshold', () => {
    const s = initialPerfStallState()
    const r = observeFrame(s, DEFAULT_STALL_THRESHOLD_MS + 1)
    expect(r.fire).toBe(false)
    expect(r.state.count).toBe(1)
    expect(r.state.fired).toBe(false)
  })

  it('fires once after the required number of stalls accumulates', () => {
    let state = initialPerfStallState()
    let lastFire = false
    for (let i = 0; i < DEFAULT_STALLS_TO_FIRE - 1; i++) {
      const r = observeFrame(state, 1000)
      state = r.state
      lastFire = r.fire
    }
    expect(lastFire).toBe(false)
    expect(state.fired).toBe(false)
    const final = observeFrame(state, 1000)
    expect(final.fire).toBe(true)
    expect(final.state.fired).toBe(true)
  })

  it('never fires twice — once fired, observeFrame returns fire:false even on more stalls', () => {
    let state = initialPerfStallState()
    for (let i = 0; i < DEFAULT_STALLS_TO_FIRE; i++) {
      state = observeFrame(state, 1000).state
    }
    expect(state.fired).toBe(true)
    const r = observeFrame(state, 5000)
    expect(r.fire).toBe(false)
    expect(r.state).toBe(state)
  })

  it('accepts custom threshold + stalls-to-fire', () => {
    const opts = { thresholdMs: 200, stallsToFire: 1 }
    const r = observeFrame(initialPerfStallState(), 201, opts)
    expect(r.fire).toBe(true)
    expect(r.state.fired).toBe(true)
    const ok = observeFrame(initialPerfStallState(), 199, opts)
    expect(ok.fire).toBe(false)
    expect(ok.state.count).toBe(0)
  })
})
