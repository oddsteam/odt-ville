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

// The only thing voice needs to know about a peer: where they are, in tiles.
// Structural on purpose — MapScene's richer RemotePlayer satisfies it without
// this module importing anything from the game.
export interface VoicePosition {
  x: number
  y: number
}

// Tiles. Deliberately tighter than PresenceChannel::CELL (12): we subscribe to
// a 3x3 cell window so we can *see* peers well before we can hear them.
export const VOICE_RADIUS = 6

// The mesh is O(n^2) connections — six peers is 15 links, which is already the
// point where a laptop fan notices. Beyond this the nearest peers win.
export const POD_CAP = 6
