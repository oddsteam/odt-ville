// The Placard — the note a Standee carries (#372, ADR-0015). Pure display
// helpers shared by the shell's detail panel; no React, no DOM, no data
// service, so every surface that shows a Placard formats it the one way. The
// reply-link validation (#373) lands here too, alongside these.

// The short line's display cap and the expiry predicate live with the rest of
// the Standees contract (#519, #520). Longer input is clipped with an ellipsis
// here rather than allowed to grow the bubble unbounded — the same cap the
// server enforces on write; `hasExpired` is re-exported so the Placard's
// consumers keep one import for the note's helpers.
import { SHORT_LINE_MAX, hasExpired } from './schema.ts'
export { hasExpired }

// The full Placard the shell renders on press-A (#372): the note plus who left
// it. The game emits this exact shape over the `readStandee` seam; the shell
// owns the panel. `detail` and the owner fields are null when absent.
export interface Placard {
  id: number
  message: string
  detail: string | null
  ownerName: string | null
  ownerAvatarUrl: string | null
  // The place to reply the owner supplied (#373): a campfire, a thread. Raw as
  // stored — `replyHref` gates whether it ever becomes a clickable button.
  replyLink: string | null
  // Whether the viewer owns this Standee (#370): the panel offers *pick up* on
  // your own cutout where it offers *reply* on someone else's.
  mine: boolean
  // When this cutout retires itself (#374), ISO-8601 as the server stamped it.
  // The panel dates the note — "Sunday" in a message is otherwise ambiguous —
  // and the runtime takes the cutout down off this alone, with no round trip.
  expiresAt: string
}

// The short line, clipped to the display cap. At or under the cap it rides
// through unchanged (trimmed of surrounding space); over it, it is cut to
// `SHORT_LINE_MAX` characters with a trailing ellipsis.
export function shortLine(message: string): string {
  const line = message.trim()
  if (line.length <= SHORT_LINE_MAX) return line
  return `${line.slice(0, SHORT_LINE_MAX).trimEnd()}…`
}

// The owner-supplied reply link, gated exactly as `cardBadge.ts` gates a card's
// link (#373): the string is owner-supplied and ends up in `window.open`, so
// only ever navigate to an http(s) address. Anything else — a `javascript:`
// URL, a `mailto:`, a malformed or empty string — returns null, so the Placard
// simply shows no button and still says its piece.
export function replyHref(url: string): string | null {
  try {
    return /^https?:$/.test(new URL(url).protocol) ? url : null
  } catch {
    return null
  }
}

// When the Standee goes, for the detail panel. The message says "Sunday"; this
// says *which* Sunday, in the reader's own locale. Past its moment it reads
// "Expired" — a Placard can still be open when its Standee retires.
export function expiryNote(expiresAt: string, now: number = Date.now()): string {
  if (hasExpired(expiresAt, now)) return 'Expired'
  const when = new Date(expiresAt).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `Expires ${when}`
}

// The Placard's byline — who left it, for the detail panel. A blank or missing
// name (a dangling owner reference, ADR-0015) reads as "someone" rather than a
// stray dash, so the panel still attributes the note.
export function attribution(name: string): string {
  const who = name.trim()
  return `— ${who || 'someone'}`
}
