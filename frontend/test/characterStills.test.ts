import { describe, expect, it } from 'vitest'
import { normalizeManifest, stillForFacing } from '../src/kernel/characterManifest.js'

// The static frame a character shows standing (#266) — what a presence peer
// renders, since peers don't animate yet. Idle first, walk as the fallback for
// a character with no idle art, and the down posture (flipped for left) for a
// direction that authors neither.
describe('stillForFacing', () => {
  const rect = (x: number) => ({ x, y: 0, w: 32, h: 64 })

  it('prefers the direction own idle posture', () => {
    const m = normalizeManifest({
      postures: { idleLeft: [rect(1), rect(2)], walkLeft: [rect(3)] },
    })

    expect(stillForFacing(m, 'left')).toEqual({ name: 'idleLeft.0', rect: rect(1), flipX: false })
  })

  it('falls back to walk when the direction authors no idle', () => {
    const m = normalizeManifest({ postures: { walkUp: [rect(7)] } })

    expect(stillForFacing(m, 'up')).toEqual({ name: 'walkUp.0', rect: rect(7), flipX: false })
  })

  it('borrows the down posture, flipped, for an unauthored left', () => {
    const m = normalizeManifest({ postures: { idleDown: [rect(9)] } })

    expect(stillForFacing(m, 'left')).toEqual({ name: 'idleDown.0', rect: rect(9), flipX: true })
  })

  it('is null for a manifest with no frames at all', () => {
    expect(stillForFacing(normalizeManifest(null), 'down')).toBeNull()
  })
})
