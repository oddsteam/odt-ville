// The warp seam (#254): a successful Node swap fades through black; the swap
// runs while the screen is black, and input stays locked across the whole
// effect. Refusal never reaches here — travel()/enterPortal only call the fade
// on the success path — so there's nothing to test for "no fade on refuse"
// beyond the call sites already guarding it.

import { describe, expect, it } from 'vitest'
import { fadeThrough } from './transition.ts'

const recorder = () => {
  const log: string[] = []
  return {
    log,
    deps: {
      cover: (o: number) => log.push(`cover:${o}`),
      wait: async () => void log.push('wait'),
      lock: (on: boolean) => log.push(`lock:${on}`),
    },
  }
}

describe('fadeThrough', () => {
  it('locks, blacks out, swaps at black, fades back, unlocks — in order', async () => {
    const { log, deps } = recorder()
    await fadeThrough(() => log.push('swap'), deps)
    expect(log).toEqual(['lock:true', 'cover:1', 'wait', 'swap', 'cover:0', 'wait', 'lock:false'])
  })

  it('still clears the black and unlocks if the swap throws', async () => {
    const { log, deps } = recorder()
    await expect(fadeThrough(() => { throw new Error('boom') }, deps)).rejects.toThrow('boom')
    expect(log).toEqual(['lock:true', 'cover:1', 'wait', 'cover:0', 'wait', 'lock:false'])
  })
})
