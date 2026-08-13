import { describe, expect, it } from 'vitest'
import { silenceKeyboard } from './gameKeyboard.ts'

describe('silenceKeyboard', () => {
  it('silences the game keyboard and hands it back on restore', () => {
    const kb = { enabled: true }
    const restore = silenceKeyboard(kb)
    expect(kb.enabled).toBe(false)
    restore()
    expect(kb.enabled).toBe(true)
  })

  it('is a no-op when the game has no keyboard yet', () => {
    expect(() => silenceKeyboard(null)()).not.toThrow()
  })
})
