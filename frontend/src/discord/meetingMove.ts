import { RequestError } from '../lib/http.ts'
import { runEdge } from '../lib/runEdge.ts'
import { DiscordService } from './service.ts'
import { inZone } from '../kernel/zones.ts'
import type { Zone } from '../kernel/schema.ts'

// The Discord shell's voice handle (#571, plan decisions 3 + 5). Discord
// carries the audio, so "voice" here is only: walking INTO a meeting zone asks
// the bot to move you to the voice channel named like the room. It fills the
// same port MapScene feeds with our tile (VoiceHandle in voice/schema.ts —
// matched structurally, since src/discord/ may not import voice/).
//
// Edge-triggered: MapScene calls update on spawn, on our steps and on every
// peer frame (same tile), so we act only when a step changes the room under us
// to a meeting room. The first update is the spawn and never moves — a player
// re-opened inside a room (#572) is already in that room's channel. A failed
// move forgets the room, so the next step inside it retries.

export const MOVING_NOTICE = 'Moving you to the meeting room. Press the Activity button to come back.'
export const NO_CHANNEL_NOTICE = 'This room has no voice channel.'
export const MOVE_FAILED_NOTICE = 'Could not move you to the meeting room.'

// The backend's `{ error }` code from a failed request, if it sent one.
function errorCode(e: unknown) {
  try {
    return e instanceof RequestError ? (JSON.parse(e.body) as { error?: string }).error : undefined
  } catch {
    return undefined
  }
}

// The meeting room at this tile, or null outside one.
function roomAt(zones: readonly Zone[], x: number, y: number) {
  for (const z of zones) {
    if (z.payload.kind === 'meeting' && inZone(z, x, y)) return z.payload
  }
  return null
}

// `onRoom` records the player's last room (#572): the roomId on entering a
// meeting room — awaited before the move, since the move closes the Activity —
// and null on walking out or a failed move, so a normal re-open spawns as
// usual. A failed save never blocks the move.
export function connectDiscordMeetings({
  guildId,
  zones,
  notify,
  onRoom = async () => {},
}: {
  guildId: string
  zones: readonly Zone[]
  notify: (message: string | null) => void
  onRoom?: (roomId: string | null) => Promise<unknown>
}) {
  let current: string | null | undefined // roomId; undefined = no update yet (spawn)
  let tile: string | undefined
  const leave = () => void onRoom(null).catch(() => {})

  // `room` is the channel name to match: the label, else the roomId (matched
  // by name inclusion server-side).
  async function move(roomId: string, room: string) {
    notify(MOVING_NOTICE)
    await onRoom(roomId).catch(() => {})
    const error = await runEdge(DiscordService.move(guildId, room)).then(
      () => null, // Discord moves us; this Activity closes with the old channel.
      (e: unknown) => e,
    )
    if (!error || current !== roomId) return // moved, or already walked on (that step owns the HUD + last_room)
    notify(errorCode(error) === 'no_voice_channel' ? NO_CHANNEL_NOTICE : MOVE_FAILED_NOTICE)
    current = null
    leave()
  }

  return {
    update(own: { x: number; y: number }) {
      const at = `${own.x},${own.y}`
      if (at === tile) return // a peer frame, not a step
      tile = at
      const room = roomAt(zones, own.x, own.y)
      const roomId = room?.roomId ?? null
      if (roomId === current) return
      const spawn = current === undefined
      current = roomId
      if (spawn) return
      if (room) return void move(room.roomId, room.label ?? room.roomId)
      notify(null)
      leave()
    },
    setMute() {},
    setCamera() {},
    async setScreenShare() {},
    stop() {},
  }
}
