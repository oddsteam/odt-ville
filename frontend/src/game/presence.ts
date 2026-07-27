// Presence multiplayer (#88): pure frame-folding for the remote-player
// roster. No Phaser, no network — MapScene renders off the returned action,
// the cable client (lib/presenceClient) owns the wire.

import type { Direction } from './phaser/movement.ts'

// What a person is working on right now (#317), pre-resolved by Eira. We never
// see a Jira issue — only these three fields, and `status` is free display
// text, not an enum.
export interface Card {
  title: string
  status: string
  url: string
}

export interface RemotePlayer {
  name: string
  x: number
  y: number
  facing: Direction
  // The peer's character (#266), stamped server-side. Null means they have no
  // manifest at all and render the bundled stills.
  manifestId: number | null
  // Their card (#317). Null means they hold none — put down, never picked up,
  // or simply never linked to Eira, which is indistinguishable and fine.
  card: Card | null
}

export type PresenceFrame =
  | {
      type: 'move'
      userId: string
      name: string
      x: number
      y: number
      facing: Direction
      // Absent on a frame from a server that predates #266 — folded to null,
      // which is the bundled-stills fallback either way.
      manifestId?: number | null
      // The sender's card, stamped server-side — this is what gives a peer
      // walking into range the badge they were already holding.
      card?: Card | null
    }
  | { type: 'leave'; userId: string; name: string }
  | { type: 'card'; userId: string; card: Card | null }

export interface FrameResult {
  action: 'spawn' | 'move' | 'remove' | 'card' | 'none'
  // Roster sync is stateless echo: first sighting of a peer means they don't
  // know us yet, so the scene re-announces its own position once.
  echo: boolean
}

const NONE: FrameResult = { action: 'none', echo: false }

// Fold one wire frame into the roster (mutated in place) and say what the
// scene must do about it. Own echoes and malformed frames fold to 'none' —
// a bad frame must never crash the render loop.
export function applyFrame(
  roster: Map<string, RemotePlayer>,
  frame: PresenceFrame,
  ownId: string,
): FrameResult {
  if (typeof frame?.userId !== 'string' || frame.userId === ownId) return NONE

  if (frame.type === 'leave') {
    return roster.delete(frame.userId) ? { action: 'remove', echo: false } : NONE
  }
  // The card stream is unpartitioned (#317) — every client hears about
  // everyone — so a card for someone we can't see is dropped rather than
  // conjuring them onto the roster. Their next position frame carries it.
  if (frame.type === 'card') {
    const peer = roster.get(frame.userId)
    if (!peer) return NONE
    peer.card = frame.card ?? null
    return { action: 'card', echo: false }
  }
  if (frame.type !== 'move' || typeof frame.x !== 'number' || typeof frame.y !== 'number') {
    return NONE
  }

  const known = roster.has(frame.userId)
  roster.set(frame.userId, {
    name: frame.name,
    x: frame.x,
    y: frame.y,
    facing: frame.facing,
    manifestId: frame.manifestId ?? null,
    card: frame.card ?? null,
  })
  return known ? { action: 'move', echo: false } : { action: 'spawn', echo: true }
}

// Must match PresenceChannel::CELL — the server partitions on the same grid.
const CELL = 12
const cellOf = (n: number) => Math.floor(n / CELL)

// Interest management (#158): walking out of a cell's neighbourhood stops its
// stream server-side, and a stopped stream sends no `leave` — so the peers who
// were in it would sit on the roster frozen forever. Drop everyone outside our
// own 3x3 window and name them, so the scene can destroy their sprites.
export function pruneOutOfRange(
  roster: Map<string, RemotePlayer>,
  own: { x: number; y: number },
): string[] {
  const [cx, cy] = [cellOf(own.x), cellOf(own.y)]
  const gone = [...roster]
    .filter(
      ([, p]) => Math.abs(cellOf(p.x) - cx) > 1 || Math.abs(cellOf(p.y) - cy) > 1,
    )
    .map(([id]) => id)
  gone.forEach((id) => roster.delete(id))
  return gone
}
