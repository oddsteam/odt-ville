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

// The meeting room at this tile, or null outside one.
function roomAt(zones: readonly Zone[], x: number, y: number) {
  for (const z of zones) {
    if (z.payload.kind === 'meeting' && inZone(z, x, y)) return z.payload
  }
  return null
}

// `onRoom` records the player's last room (#572): the roomId on entering a
// meeting room — awaited before the move, since the move closes the Activity —
// and null on walking out, so a normal re-open spawns as usual. A failed save
// never blocks the move.
export function connectDiscordMeetings({
  guildId,
  zones,
  notify,
  onRoom = async () => {},
  fetchFn = fetch,
}: {
  guildId: string
  zones: readonly Zone[]
  notify: (message: string | null) => void
  onRoom?: (roomId: string | null) => Promise<unknown>
  fetchFn?: typeof fetch
}) {
  let current: string | null | undefined // roomId; undefined = no update yet (spawn)

  // `room` is the channel name to match: the label, else the roomId (matched
  // by name inclusion server-side).
  async function move(roomId: string, room: string) {
    notify(MOVING_NOTICE)
    await onRoom(roomId).catch(() => {})
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
      const roomId = room?.roomId ?? null
      if (roomId === current) return
      const spawn = current === undefined
      current = roomId
      if (spawn) return
      if (room) return void move(room.roomId, room.label ?? room.roomId)
      notify(null)
      void onRoom(null).catch(() => {})
    },
    setMute() {},
    setCamera() {},
    async setScreenShare() {},
    stop() {},
  }
}
