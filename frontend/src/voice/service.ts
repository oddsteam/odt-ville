// Proximity voice (#159), public surface: pod membership.
//
// Given where we stand and who presence has put on the roster, say who we
// should be hearing and how loudly. No WebRTC, no audio nodes, no network —
// the media layer (#280, #281) reads off this.

import { POD_CAP, VOICE_RADIUS, type VoicePeer, type VoicePosition } from './schema.ts'

// ponytail: linear falloff, not inverse-square. It is predictable, never
// divides by zero, and nobody can hear the difference over a voice channel.
// Swap in a curve if playtesting says the drop-off feels wrong (#281).
// `radius` defaults to VOICE_RADIUS (the audible band, gain math unchanged).
// Membership passes a wider band (PRE-JOIN / LEAVE, #310) to ask "is anyone
// near enough to be connected to?" — same proximity source, different question.
export function podFor(
  own: VoicePosition,
  roster: Map<string, VoicePosition>,
  radius: number = VOICE_RADIUS,
): VoicePeer[] {
  return [...roster]
    .map(([userId, p]) => ({ userId, d: Math.hypot(p.x - own.x, p.y - own.y) }))
    .filter(({ d }) => d < radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, POD_CAP)
    .map(({ userId, d }) => ({ userId, gain: 1 - d / radius }))
}
