// The Placard's pure display helpers (#372, ADR-0015): the short line clips to
// a bounded glance and the byline attributes it — the boundaries the panel and
// the overhead bubble both lean on.

import { describe, expect, it } from 'vitest'
import { shortLine, attribution, replyHref, hasExpired, expiryNote } from './placard.ts'
import { SHORT_LINE_MAX } from './schema.ts'

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

// Expiry (#374): a Standee is time-bound, and the boundary is the interesting
// part — the client retires the cutout off this comparison alone, with no
// server round trip, so a moment either side of it must not disagree.
describe('hasExpired', () => {
  const EXPIRY = '2026-08-09T08:00:00.000Z'
  const at = Date.parse(EXPIRY)

  it('is not expired a moment before, nor at the very moment it falls due', () => {
    expect(hasExpired(EXPIRY, at - 1)).toBe(false)
    // Inclusive, matching the server's `expires_at >= now` load scope, so the
    // cutout never vanishes a tick before the load query would have dropped it.
    expect(hasExpired(EXPIRY, at)).toBe(false)
  })

  it('is expired a millisecond after it falls due', () => {
    expect(hasExpired(EXPIRY, at + 1)).toBe(true)
  })

  it('treats an unparseable expiry as still standing, never a silent vanish', () => {
    expect(hasExpired('not a date', at)).toBe(false)
  })
})

describe('expiryNote', () => {
  const EXPIRY = '2026-08-09T08:00:00.000Z'
  const at = Date.parse(EXPIRY)

  it('names the day it goes, so "Sunday" in the message is unambiguous', () => {
    const note = expiryNote(EXPIRY, at - 1)
    expect(note.startsWith('Expires ')).toBe(true)
    // The weekday and the date, as the reader's own locale writes them.
    const local = new Date(EXPIRY)
    expect(note).toContain(local.toLocaleDateString(undefined, { weekday: 'long' }))
    expect(note).toContain(String(local.getDate()))
  })

  it('says so plainly once the moment has passed', () => {
    expect(expiryNote(EXPIRY, at + 1)).toBe('Expired')
  })
})

describe('replyHref', () => {
  it('passes an http(s) reply link through unchanged', () => {
    expect(replyHref('https://basecamp.com/1/campfire/2')).toBe('https://basecamp.com/1/campfire/2')
    expect(replyHref('http://example.com/thread')).toBe('http://example.com/thread')
  })

  it('refuses a javascript: URL — no click-through at all', () => {
    expect(replyHref('javascript:alert(1)')).toBeNull()
  })

  it('refuses a non-http(s) scheme', () => {
    expect(replyHref('mailto:ada@example.com')).toBeNull()
  })

  it('refuses a malformed link', () => {
    expect(replyHref('not a url')).toBeNull()
  })

  it('refuses an empty or blank link', () => {
    expect(replyHref('')).toBeNull()
    expect(replyHref('   ')).toBeNull()
  })
})
