// Presence multiplayer (#88): pure frame-folding for the remote-player
// roster. No Phaser, no network — MapScene renders off the returned action,
// the cable client (lib/presenceClient) owns the wire.

import type { Direction } from './phaser/movement.ts'

export interface RemotePlayer {
  name: string
  x: number
  y: number
  facing: Direction
}

export type PresenceFrame =
  | { type: 'move'; userId: string; name: string; x: number; y: number; facing: Direction }
  | { type: 'leave'; userId: string; name: string }

export interface FrameResult {
  action: 'spawn' | 'move' | 'remove' | 'none'
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
  if (frame.type !== 'move' || typeof frame.x !== 'number' || typeof frame.y !== 'number') {
    return NONE
  }

  const known = roster.has(frame.userId)
  roster.set(frame.userId, { name: frame.name, x: frame.x, y: frame.y, facing: frame.facing })
  return known ? { action: 'move', echo: false } : { action: 'spawn', echo: true }
}
