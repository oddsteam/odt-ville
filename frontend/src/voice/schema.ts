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

// The local mic's transmit state (#282), reported by the mesh to the on-screen
// indicator + mute toggle. `live` is the honest "you are being heard" light:
// mic granted, not muted, and at least one peer in the pod. `denied` is a
// declined browser permission — voice cleanly off, not an error.
export interface MicStatus {
  live: boolean
  muted: boolean
  denied: boolean
}

// The AUDIBLE radius, in tiles: where podFor's gain math applies. Tightened
// 6 -> 2 (ADR-0011, #310) so people stop stepping into conversations by
// accident. Membership is a *separate*, wider band (below) — you are connected
// before you are audible, and stay connected after, so a boundary never thrashes.
export const VOICE_RADIUS = 2

// The mesh is O(n^2) connections — six peers is 15 links, which is already the
// point where a laptop fan notices. Beyond this the nearest peers win.
export const POD_CAP = 6

// Membership hysteresis (ADR-0011, #310). Three radii, not one: connect early
// (PRE-JOIN), hear (VOICE_RADIUS), disconnect late (LEAVE, after a dwell). The
// dead-band + dwell keep someone pacing a boundary from thrashing a billable
// LiveKit session (bills round up to a 1-minute floor per join, #298).

// Walk speed in tiles/sec: one tile per MOVE_MS (170ms, src/game/constants.js).
// Inlined, not imported — voice must not depend on the game runtime (arch rule
// voice-depends-only-on-shared-infrastructure). Keep in step with MOVE_MS.
const WALK_TILES_PER_SEC = 1000 / 170

// Measured LiveKit Cloud room-join latency (#310 spike output): room.connect()
// resolves in ~this long with the token pre-fetched. createLivekitVoice emits
// the live measurement (onJoinLatency) to refine this. Raise it if joins run slower.
const JOIN_LATENCY_MS = 500

// Pre-join band = walk_speed x join_latency, rounded up (ADR-0011): enough lead
// time to finish the join before the peer is audible. Derived from the latency
// measurement, NOT scaled down from VOICE_RADIUS — the two do not scale together.
export const PREJOIN_RADIUS = Math.ceil((WALK_TILES_PER_SEC * JOIN_LATENCY_MS) / 1000)

// Leave band: one tile beyond pre-join, so the connected set is sticky — a peer
// drifting back out past pre-join stays connected until they clear this too.
export const LEAVE_RADIUS = PREJOIN_RADIUS + 1

// Dwell: once the leave band empties, wait this long before disconnecting. A
// peer returning within it cancels the leave — no reconnect, no fresh billed minute.
export const DWELL_MS = 5000
