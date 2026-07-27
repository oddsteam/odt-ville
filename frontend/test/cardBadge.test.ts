import { describe, expect, it } from 'vitest'

import { badgeText, cardHref, statusColor } from '../src/game/phaser/cardBadge.ts'

// The card badge over a peer's head (#317): what it says, what colour it is,
// and where clicking it goes.
describe('statusColor', () => {
  // Status is free display text, not an enum — an unmapped Jira status passes
  // through verbatim — so the colour is derived from the string rather than
  // branched on a fixed set nobody can keep in sync with Jira's workflow.
  it('gives one status one colour, everywhere', () => {
    expect(statusColor('IN CODE REVIEW')).toBe(statusColor('IN CODE REVIEW'))
  })

  it('separates the statuses people actually see', () => {
    const seen = ['DOING', 'IN CODE REVIEW', 'IN TC PREP', 'TEST IN DEV'].map(statusColor)

    expect(new Set(seen).size).toBe(seen.length)
  })

  it('colours a status nobody has mapped yet', () => {
    expect(statusColor('BLOCKED ON LEGAL')).toMatch(/^hsl\(/)
  })
})

describe('badgeText', () => {
  it('shows the title', () => {
    expect(badgeText({ title: 'Bake the map', status: 'DOING', url: '' })).toBe('Bake the map')
  })

  // A badge floats over one avatar in a crowded room — a full Jira summary
  // would blanket the neighbours.
  it('clips a title that would swamp the room', () => {
    const text = badgeText({ title: 'x'.repeat(80), status: 'DOING', url: '' })

    expect(text.length).toBeLessThanOrEqual(25)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('cardHref', () => {
  it('passes a Jira link through', () => {
    expect(cardHref('https://jira.odds.team/browse/ONEREV-1')).toBe(
      'https://jira.odds.team/browse/ONEREV-1',
    )
  })

  // The url is ingested text that ends up in window.open — only ever navigate.
  it('refuses a scheme that is not a navigation', () => {
    expect(cardHref('javascript:alert(1)')).toBeNull()
    expect(cardHref('')).toBeNull()
    expect(cardHref('not a url')).toBeNull()
  })
})
