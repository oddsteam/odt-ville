// The RMS reduction behind the test-env voice meter (#287): the only pure bit
// of the overlay worth a check — silence reads flat, louder audio reads higher,
// full-scale clamps. The Web Audio wiring around it isn't meaningful in jsdom.

import { describe, expect, it } from 'vitest'
import { level } from './VoiceMeters.tsx'

describe('level', () => {
  it('reads silence (flat 128) as zero', () => {
    expect(level(new Uint8Array(32).fill(128))).toBe(0)
  })

  it('rises with amplitude and clamps at 1', () => {
    const quiet = new Uint8Array([128 + 10, 128 - 10, 128 + 10, 128 - 10])
    const loud = new Uint8Array([255, 0, 255, 0])
    expect(level(quiet)).toBeGreaterThan(0)
    expect(level(quiet)).toBeLessThan(1)
    expect(level(loud)).toBe(1)
  })
})
