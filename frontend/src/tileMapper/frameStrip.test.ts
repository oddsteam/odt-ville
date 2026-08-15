import { describe, expect, it } from 'vitest'

import { deriveFrameCount } from './frameStrip.ts'

// An animated object's frame count is never typed (#436): it falls out of the
// uploaded strip's own width divided by one frame's width (footprint × cell).
describe('deriveFrameCount', () => {
  it('derives the pack spell book at 1×2 tiles of 32px', () => {
    expect(deriveFrameCount(2304, 1, 32)).toEqual({ ok: true, frameCount: 72 })
  })

  it('derives the pack door strip', () => {
    expect(deriveFrameCount(160, 1, 32)).toEqual({ ok: true, frameCount: 5 })
  })

  it('rejects a strip that is not a whole number of frames', () => {
    const r = deriveFrameCount(200, 1, 32)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toContain('200')
    expect(!r.ok && r.message).toContain('32')
  })

  it('rejects a fractional footprint rather than rounding it', () => {
    expect(deriveFrameCount(2304, 1.4, 32).ok).toBe(false)
  })

  it('rejects a strip narrower than one frame', () => {
    expect(deriveFrameCount(16, 1, 32).ok).toBe(false)
  })
})
