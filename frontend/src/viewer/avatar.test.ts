import { describe, expect, it } from 'vitest'

import { initials } from './Avatar.tsx'

// The header falls back to initials whenever there is no avatar to show — a
// null column (#320) or a stale URL the proxy 404s (ADR-0012). The fallback has
// to produce something for every name the roster can hold, never an empty chip.
describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Alice Wonderland')).toBe('AW')
  })

  it('uses one letter for a single-word name', () => {
    expect(initials('Alice')).toBe('A')
  })

  it('ignores extra words and stray spacing', () => {
    expect(initials('  ada  b  lovelace ')).toBe('AB')
  })

  it('falls back to a face when the name yields no letters', () => {
    expect(initials('')).toBe('🙂')
  })
})
