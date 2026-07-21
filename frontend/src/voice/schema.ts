// Proximity voice (#159), public surface: types and the tuning constants.
//
// This module is deliberately independent of the game runtime — see the
// voice-depends-only-on-shared-infrastructure rule in .dependency-cruiser.cjs.
// It never imports src/game/, so it can be lifted out wholesale later.

export interface VoicePeer {
  userId: string
  // 1 on our own tile, falling linearly to 0 at VOICE_RADIUS.
  gain: number
}

// A WebRTC signalling blob relayed peer-to-peer by PresenceChannel (#279).
// The server stamps `from` (the sender's Keycloak id, never client-claimed)
// and never inspects `payload` — it is whatever the sender put there: an SDP
// offer, an SDP answer, or a trickled ICE candidate. Opaque on purpose, so the
// media layer (#280, #281) can evolve the handshake without touching the wire.
export interface SignalMessage {
  type: 'signal'
  from: string
  payload: unknown
}

// The only thing voice needs to know about a peer: where they are, in tiles.
// Structural on purpose — MapScene's richer RemotePlayer satisfies it without
// this module importing anything from the game.
export interface VoicePosition {
  x: number
  y: number
}

// The local mic's transmit state (#282), reported by the mesh to the on-screen
// indicator + mute toggle. `live` is the honest "you are being heard" light:
// mic granted, not muted, and at least one peer in the pod. `denied` is a
// declined browser permission — voice cleanly off, not an error.
export interface MicStatus {
  live: boolean
  muted: boolean
  denied: boolean
}

// Tiles. Deliberately tighter than PresenceChannel::CELL (12): we subscribe to
// a 3x3 cell window so we can *see* peers well before we can hear them.
export const VOICE_RADIUS = 6

// The mesh is O(n^2) connections — six peers is 15 links, which is already the
// point where a laptop fan notices. Beyond this the nearest peers win.
export const POD_CAP = 6
