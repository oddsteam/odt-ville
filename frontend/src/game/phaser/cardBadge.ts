// The card badge over a peer's head (#317) — the pure bits: what it says, what
// colour it is, and where clicking it goes. Phaser lives in MapScene; this file
// is just the rules, so they're testable without a canvas.

import type { Card } from '../presence.ts'

// Long enough for a real Jira summary to read, short enough that a badge
// doesn't blanket the avatars either side of it.
const MAX = 24

export function badgeText(card: Card): string {
  const title = card.title.trim()
  return title.length > MAX ? `${title.slice(0, MAX)}…` : title
}

// `status` is display text, not an enum: DOING, IN CODE REVIEW, IN TC PREP and
// an unmapped Jira status all arrive verbatim. So the hue comes from the string
// itself — every status gets a colour, the same one forever, and nothing has to
// be kept in sync with Jira's workflow. Fixed saturation and lightness keep
// white label text legible whatever hue lands.
export function statusColor(status: string): string {
  let hash = 0
  for (const ch of status) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${hash}, 55%, 32%)`
}

// The url is ingested text that ends up in window.open, so only ever navigate:
// anything that isn't an http(s) address gets no click-through at all.
export function cardHref(url: string): string | null {
  try {
    return /^https?:$/.test(new URL(url).protocol) ? url : null
  } catch {
    return null
  }
}
