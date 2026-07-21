// Proximity voice (#159), signalling wire (#279): the postbox half of the
// WebRTC bootstrap. Two browsers cannot form a direct link on their own — they
// must first trade an SDP offer, an answer and a trickle of ICE candidates,
// and they need an already-working channel to carry that exchange. We own one:
// the authenticated PresenceChannel. So signalling rides it. The server stamps
// the sender and forwards our opaque blob to one target peer's per-user stream.
//
// This lives on voice's public surface, never in the game: the black box does
// no network I/O (see game-runtime-never-imports-voice in the arch rules). The
// shell creates this handle and injects it into MapScene via the Phaser
// registry, exactly the path the presence handle takes (ADR-0004).

import { createConsumer } from '@rails/actioncable'
import { getAuthToken } from '../lib/authToken.ts'
import type { SignalMessage } from './schema.ts'

export interface SignallingHandle {
  // Forward an opaque handshake blob to one peer, addressed by their Keycloak
  // id. We never claim `from` — the server stamps it from the connection, so a
  // client cannot impersonate another peer (mirror of the move-frame rule).
  send(to: string, payload: unknown): void
  // Register the sole handler for inbound signals (or null to detach).
  onSignal(cb: ((message: SignalMessage) => void) | null): void
  disconnect(): void
}

// Browsers can't set an Authorization header on a WebSocket handshake and the
// JWT lives in JS memory (not a cookie), so the token rides the cable URL, the
// same way connectPresence does; ApplicationCable::Connection verifies it.
export function connectSignalling(slug: string): SignallingHandle | null {
  const token = getAuthToken()
  if (!token) return null

  const consumer = createConsumer(`/api/cable?token=${encodeURIComponent(token)}`)
  let handler: ((message: SignalMessage) => void) | null = null
  const sub = consumer.subscriptions.create(
    { channel: 'PresenceChannel', slug },
    {
      // PresenceChannel multiplexes move/leave and signalling on one channel;
      // this subscription never performs `move`, so the server attaches it to
      // no cell and only the per-user postbox lands here. Still, filter by
      // shape rather than trust that — a stray frame must not reach the mesh.
      received: (frame: unknown) => {
        if (isSignal(frame)) handler?.(frame)
      },
    },
  )
  return {
    send: (to, payload) => sub.perform('signal', { to, payload }),
    onSignal: (cb) => {
      handler = cb
    },
    disconnect: () => consumer.disconnect(),
  }
}

function isSignal(frame: unknown): frame is SignalMessage {
  return (
    typeof frame === 'object' &&
    frame !== null &&
    (frame as { type?: unknown }).type === 'signal' &&
    typeof (frame as { from?: unknown }).from === 'string'
  )
}
