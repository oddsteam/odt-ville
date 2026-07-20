// Presence multiplayer (#88): the wire half. Owns the ActionCable consumer;
// the pure roster logic lives in game/presence.ts and the rendering in
// MapScene. The shell (MapPage) creates this and hands it to the scene via
// the registry — the game never imports a data service (ADR-0004).

import { createConsumer } from '@rails/actioncable'
import { getAuthToken } from './authToken.ts'

export interface PresenceHandle {
  send(pos: { x: number; y: number; facing: string }): void
  onFrame(cb: ((frame: unknown) => void) | null): void
  disconnect(): void
}

// Browsers can't set an Authorization header on a WebSocket handshake and the
// JWT lives in JS memory (not a cookie), so the token rides the cable URL;
// ApplicationCable::Connection verifies it on connect.
// ponytail: a reconnect after token expiry replays the stale URL and is
// rejected — a page reload recovers; re-mint the URL if that ever bites.
export function connectPresence(slug: string): PresenceHandle | null {
  const token = getAuthToken()
  if (!token) return null

  const consumer = createConsumer(`/api/cable?token=${encodeURIComponent(token)}`)
  let handler: ((frame: unknown) => void) | null = null
  // ActionCable drops a `perform()` issued before the subscription confirms,
  // and MapScene announces its spawn from create() — almost always too early,
  // which left an arriving player invisible until their first step made the
  // room echo. Replaying the latest position on `connected` closes that window
  // (and re-announces us after a reconnect for free).
  let lastPos: { x: number; y: number; facing: string } | null = null
  const sub = consumer.subscriptions.create(
    { channel: 'PresenceChannel', slug },
    {
      received: (frame: unknown) => handler?.(frame),
      connected: () => {
        if (lastPos) sub.perform('move', lastPos)
      },
    },
  )
  return {
    send: (pos) => {
      lastPos = pos
      sub.perform('move', pos)
    },
    onFrame: (cb) => {
      handler = cb
    },
    disconnect: () => consumer.disconnect(),
  }
}
