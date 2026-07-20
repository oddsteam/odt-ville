// Proximity voice (#159), public surface: pod membership.
//
// Given where we stand and who presence has put on the roster, say who we
// should be hearing and how loudly. No WebRTC, no audio nodes, no network —
// the media layer (#280, #281) reads off this.

import { POD_CAP, VOICE_RADIUS, type VoicePeer, type VoicePosition } from './schema.ts'

// ponytail: linear falloff, not inverse-square. It is predictable, never
// divides by zero, and nobody can hear the difference over a voice channel.
// Swap in a curve if playtesting says the drop-off feels wrong (#281).
export function podFor(
  own: VoicePosition,
  roster: Map<string, VoicePosition>,
): VoicePeer[] {
  return [...roster]
    .map(([userId, p]) => ({ userId, d: Math.hypot(p.x - own.x, p.y - own.y) }))
    .filter(({ d }) => d < VOICE_RADIUS)
    .sort((a, b) => a.d - b.d)
    .slice(0, POD_CAP)
    .map(({ userId, d }) => ({ userId, gain: 1 - d / VOICE_RADIUS }))
}
