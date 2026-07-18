import { describe, expect, it } from 'vitest'

import {
  POSTURE_KEYS,
  POSTURE_SLOTS,
  emptyManifest,
  framesForFacing,
  normalizeManifest,
} from '../src/kernel/characterManifest.js'

// Climb postures (#55): per-direction climb slots authored in the sprite-mapper
// and played on a ladder cell (#54). They round-trip through the manifest like
// idle/walk, and are backward compatible — a manifest with no climb postures
// loads exactly as before.

describe('climb posture slots', () => {
  // Up and down share one climb animation (a ladder pose reads the same either
  // way), so there's no separate climbUp slot — 'up' reuses climbDown.
  it('has a vertical climb slot (down) plus left/right, but no separate up', () => {
    const climb = POSTURE_SLOTS.filter((s) => s.kind === 'climb').map((s) => s.key)
    expect(climb).toEqual(['climbDown', 'climbLeft', 'climbRight'])
  })

  it('exposes the climb keys + an empty slot each on a fresh manifest', () => {
    const postures = emptyManifest().postures as Record<string, unknown[]>
    for (const k of ['climbDown', 'climbLeft', 'climbRight']) {
      expect(POSTURE_KEYS).toContain(k)
      expect(postures[k]).toEqual([])
    }
    expect(POSTURE_KEYS).not.toContain('climbUp')
  })

  it('round-trips authored climb frames through normalize', () => {
    const m = normalizeManifest({ postures: { climbDown: [{ x: 1, y: 2, w: 3, h: 4 }] } })
    expect(m.postures.climbDown).toEqual([{ x: 1, y: 2, w: 3, h: 4 }])
    expect(m.postures.climbLeft).toEqual([]) // unspecified slot filled empty
  })

  it('shares the down climb animation for the up facing', () => {
    const m = normalizeManifest({ postures: { climbDown: [{ x: 0 }] } })
    expect(framesForFacing(m, 'up', 'climb')).toEqual({ slot: 'climbDown', frames: [{ x: 0 }], flipX: false })
  })

  it('resolves a facing to its own climb frames, falling back to climbDown', () => {
    const m = normalizeManifest({
      postures: { climbDown: [{ x: 0 }], climbRight: [{ x: 9 }] },
    })
    expect(framesForFacing(m, 'right', 'climb')).toEqual({ slot: 'climbRight', frames: [{ x: 9 }], flipX: false })
    // Left has no own climb frames → borrows climbDown, flipped.
    expect(framesForFacing(m, 'left', 'climb')).toEqual({ slot: 'climbDown', frames: [{ x: 0 }], flipX: true })
  })
})
