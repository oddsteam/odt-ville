// The Placard's pure display helpers (#372, ADR-0015): the short line clips to
// a bounded glance and the byline attributes it — the boundaries the panel and
// the overhead bubble both lean on.

import { describe, expect, it } from 'vitest'
import { SHORT_LINE_MAX, shortLine, attribution } from './placard.ts'

describe('shortLine', () => {
  it('passes a line at or under the cap through unchanged', () => {
    expect(shortLine('Jogging Sunday 8am, anyone?')).toBe('Jogging Sunday 8am, anyone?')
    // Exactly at the boundary is not truncation.
    const exact = 'a'.repeat(SHORT_LINE_MAX)
    expect(shortLine(exact)).toBe(exact)
  })

  it('clips a line one character over the cap to the cap plus an ellipsis', () => {
    const over = 'a'.repeat(SHORT_LINE_MAX + 1)
    expect(shortLine(over)).toBe(`${'a'.repeat(SHORT_LINE_MAX)}…`)
  })

  it('trims surrounding whitespace before measuring', () => {
    expect(shortLine('   Board games at 4   ')).toBe('Board games at 4')
  })

  it('is empty for an empty or blank line', () => {
    expect(shortLine('')).toBe('')
    expect(shortLine('   ')).toBe('')
  })
})

describe('attribution', () => {
  it('formats the owner name as a byline', () => {
    expect(attribution('Ada Lovelace')).toBe('— Ada Lovelace')
  })

  it('trims surrounding whitespace', () => {
    expect(attribution('  Ada Lovelace  ')).toBe('— Ada Lovelace')
  })

  it('falls back to "someone" for a blank or missing name', () => {
    expect(attribution('')).toBe('— someone')
    expect(attribution('   ')).toBe('— someone')
  })
})
