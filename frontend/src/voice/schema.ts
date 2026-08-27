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

// A LiveKit room key names which room to join and mint a token for. Two kinds:
// a map's proximity room and an authored meeting room (#486). The prefix strings
// live ONLY here (#518) — room.ts, livekit.ts and the Rails controller all
// compose/parse keys through these, never by hand, so a rename can't drift the
// two sides apart. A drift 403s the token request and voice silently goes quiet.
const MAP_PREFIX = 'map-'
const MEETING_PREFIX = 'meeting-'

export type RoomRef = { kind: 'map'; slug: string } | { kind: 'meeting'; roomId: string }

export function roomKey(ref: RoomRef): string {
  return ref.kind === 'meeting' ? `${MEETING_PREFIX}${ref.roomId}` : `${MAP_PREFIX}${ref.slug}`
}

// The inverse of roomKey: a key starting with the meeting prefix is a meeting
// room, anything else is a map's proximity room. parseRoomKey(roomKey(x)) === x.
export function parseRoomKey(key: string): RoomRef {
  return key.startsWith(MEETING_PREFIX)
    ? { kind: 'meeting', roomId: key.slice(MEETING_PREFIX.length) }
    : { kind: 'map', slug: key.slice(MAP_PREFIX.length) }
}

// The local mic's transmit state (#282), reported by the voice handle to the
// on-screen indicator + mute toggle. `live` is the honest "you are being heard"
// light: mic granted, not muted, and at least one peer in the pod. `denied` is a
// declined browser permission — voice cleanly off, not an error.
export interface MicStatus {
  live: boolean
  muted: boolean
  denied: boolean
}

// The voice port (#280, #522): the opaque handle the shell injects into the game
// scene via the Phaser registry (the same path presence takes, ADR-0004; the
// game runtime never imports voice). connectVoice (voice/write.ts) is the only
// producer. The scene feeds it our tile and a {x,y} projection of the roster and
// drives the mic; the meeting HUD drives the camera and screen share. No optional
// methods — LiveKit is the one transport now (ADR-0011), so every method is real.
export interface VoiceHandle {
  update(own: VoicePosition, roster: Map<string, VoicePosition>): void
  setMute(muted: boolean): void
  // Publish/unpublish the local camera in a meeting room (#487).
  setCamera(on: boolean): void
  // Share/stop sharing the screen in a meeting room (#489).
  setScreenShare(on: boolean): Promise<void>
  stop(): void
}

// The AUDIBLE radius, in tiles: where podFor's gain math applies. Tightened
// 6 -> 2 (ADR-0011, #310), then 2 -> 1.5 so only the eight surrounding tiles
// (orthogonal d=1, diagonal d≈1.41) are in earshot — "one tile" of reach.
export const VOICE_RADIUS = 1.5

// The mesh is O(n^2) connections — six peers is 15 links, which is already the
// point where a laptop fan notices. Beyond this the nearest peers win.
export const POD_CAP = 6

// Membership hysteresis (ADR-0011, #310). Three radii, not one: connect early
// (PRE-JOIN), hear (VOICE_RADIUS), disconnect late (LEAVE, after a dwell). The
// dead-band + dwell keep someone pacing a boundary from thrashing a billable
// LiveKit session (bills round up to a 1-minute floor per join, #298).

// Pre-join band = the audible band. Audio is FLAT inside a room (livekit.ts):
// connecting IS hearing, so any band wider than VOICE_RADIUS widens earshot
// with it — the old latency-derived 3-tile band is what made voice carry
// "too far". The cost of collapsing them: the ~500ms room join now starts only
// when a peer is already adjacent, so their first beat can be clipped.
export const PREJOIN_RADIUS = VOICE_RADIUS

// Leave band: one tile beyond pre-join, so the connected set is sticky — a peer
// drifting back out past pre-join stays connected until they clear this too.
export const LEAVE_RADIUS = PREJOIN_RADIUS + 1

// Dwell: once the leave band empties, wait this long before disconnecting. A
// peer returning within it cancels the leave — no reconnect, no fresh billed minute.
export const DWELL_MS = 5000
