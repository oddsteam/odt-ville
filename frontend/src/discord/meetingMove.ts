import { getAuthToken } from '../lib/authToken'
import { inZone } from '../kernel/zones.ts'
import type { Zone } from '../kernel/schema.ts'

// The Discord shell's voice handle (#571, plan decisions 3 + 5). Discord
// carries the audio, so "voice" here is only: walking INTO a meeting zone asks
// the bot to move you to the voice channel named like the room. It fills the
// same port MapScene feeds with our tile (VoiceHandle in voice/schema.ts —
// matched structurally, since src/discord/ may not import voice/).
//
// Edge-triggered: MapScene calls update on spawn and on every peer frame, so
// we act only when the room under us changes to a meeting room. The first
// update is the spawn and never moves — a player re-opened inside a room
// (#572) is already in that room's channel.

export const MOVING_NOTICE = 'Moving you to the meeting room. Press the Activity button to come back.'
export const NO_CHANNEL_NOTICE = 'This room has no voice channel.'
export const MOVE_FAILED_NOTICE = 'Could not move you to the meeting room.'

// The meeting room's name at this tile (its label, else its roomId — the
// channel is matched by name inclusion server-side), or null outside one.
function roomAt(zones: readonly Zone[], x: number, y: number): string | null {
  for (const z of zones) {
    if (z.payload.kind === 'meeting' && inZone(z, x, y)) return z.payload.label ?? z.payload.roomId
  }
  return null
}

export function connectDiscordMeetings({
  guildId,
  zones,
  notify,
  fetchFn = fetch,
}: {
  guildId: string
  zones: readonly Zone[]
  notify: (message: string | null) => void
  fetchFn?: typeof fetch
}) {
  let current: string | null | undefined // undefined = no update yet (spawn)

  async function move(room: string) {
    notify(MOVING_NOTICE)
    const res = await fetchFn('/api/v1/discord/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
      body: JSON.stringify({ guild_id: guildId, room }),
    }).catch(() => null)
    if (res?.ok) return // Discord moves us; this Activity closes with the old channel.
    const code = res && ((await res.json().catch(() => ({}))) as { error?: string }).error
    notify(code === 'no_voice_channel' ? NO_CHANNEL_NOTICE : MOVE_FAILED_NOTICE)
  }

  return {
    update(own: { x: number; y: number }) {
      const room = roomAt(zones, own.x, own.y)
      if (room === current) return
      const spawn = current === undefined
      current = room
      if (spawn) return
      if (room) void move(room)
      else notify(null)
    },
    setMute() {},
    setCamera() {},
    async setScreenShare() {},
    stop() {},
  }
}
