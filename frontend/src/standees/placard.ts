// The Placard — the note a Standee carries (#372, ADR-0015). Pure display
// helpers shared by the shell's detail panel; no React, no DOM, no data
// service, so every surface that shows a Placard formats it the one way. The
// reply-link validation (#373) lands here too, alongside these.

// The short line's display cap. The line floats over the cutout's head and
// heads the detail panel, so it stays a glance — never a paragraph. The detail
// body carries the specifics (time, place, what to bring). Longer input is
// clipped with an ellipsis rather than allowed to grow the bubble unbounded.
export const SHORT_LINE_MAX = 60

// The full Placard the shell renders on press-A (#372): the note plus who left
// it. The game emits this exact shape over the `readStandee` seam; the shell
// owns the panel. `detail` and the owner fields are null when absent.
export interface Placard {
  id: number
  message: string
  detail: string | null
  ownerName: string | null
  ownerAvatarUrl: string | null
}

// The short line, clipped to the display cap. At or under the cap it rides
// through unchanged (trimmed of surrounding space); over it, it is cut to
// `SHORT_LINE_MAX` characters with a trailing ellipsis.
export function shortLine(message: string): string {
  const line = message.trim()
  if (line.length <= SHORT_LINE_MAX) return line
  return `${line.slice(0, SHORT_LINE_MAX).trimEnd()}…`
}

// The Placard's byline — who left it, for the detail panel. A blank or missing
// name (a dangling owner reference, ADR-0015) reads as "someone" rather than a
// stray dash, so the panel still attributes the note.
export function attribution(name: string): string {
  const who = name.trim()
  return `— ${who || 'someone'}`
}
