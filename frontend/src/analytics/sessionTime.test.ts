import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createSessionTimer } from './sessionTime.ts'

// A controllable clock so we can drive foreground/background spans precisely.
let clock = 0
const now = () => clock
const capture = vi.fn<(seconds: number) => void>()

beforeEach(() => {
  clock = 0
  capture.mockClear()
})

describe('createSessionTimer', () => {
  it('accumulates only foreground (visible) time and excludes away time', () => {
    const timer = createSessionTimer({ now, capture })
    timer.visible() // t=0 tab opens, foreground
    clock = 5000
    timer.hidden() // 5s foreground, then user switches away
    clock = 8000
    timer.visible() // 3s away (excluded), back to foreground
    clock = 10000
    timer.end() // +2s foreground => 7s total

    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith(7)
  })

  it('counts foreground time that is still running at end', () => {
    const timer = createSessionTimer({ now, capture })
    timer.visible()
    clock = 4200
    timer.end()
    expect(capture).toHaveBeenCalledWith(4)
  })

  it('rounds active seconds to the nearest second', () => {
    const timer = createSessionTimer({ now, capture })
    timer.visible()
    clock = 4600
    timer.end()
    expect(capture).toHaveBeenCalledWith(5)
  })

  it('is idempotent — a second end() does not capture again', () => {
    const timer = createSessionTimer({ now, capture })
    timer.visible()
    clock = 1000
    timer.end()
    timer.end()
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('repeated visible() calls do not double-count', () => {
    const timer = createSessionTimer({ now, capture })
    timer.visible()
    clock = 2000
    timer.visible() // already foreground — must not reset the running span
    clock = 5000
    timer.end()
    expect(capture).toHaveBeenCalledWith(5)
  })

  it('hidden() while already hidden is a no-op', () => {
    const timer = createSessionTimer({ now, capture })
    // never went visible; hidden should not accumulate negative/garbage time
    clock = 3000
    timer.hidden()
    clock = 4000
    timer.end()
    expect(capture).toHaveBeenCalledWith(0)
  })
})
