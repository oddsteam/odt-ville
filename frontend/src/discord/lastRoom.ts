import type { BakedMap } from '../kernel/schema.ts'

// Spawn after a hop (#572, plan decision 5). The meeting move closes the
// Activity; when the player presses the Activity button again they should land
// back inside the room they left through, not at map centre. meetingMove
// records the room's roomId as `last_room` (cleared on walking out), and here
// we turn it into one extra named spawn at the zone's centre — so MapScene's
// existing spawnTile picks it up via entrySpawnId, with no game change.
export const LAST_ROOM_SPAWN = 'discord:last-room'

export function spawnInLastRoom(
  map: BakedMap,
  lastRoom: string | null,
): { map: BakedMap; entrySpawnId: string | undefined } {
  const zone = map.zones?.find((z) => z.payload.kind === 'meeting' && z.payload.roomId === lastRoom)
  if (!zone) return { map, entrySpawnId: undefined }
  const spawn = {
    id: LAST_ROOM_SPAWN,
    x: zone.x + Math.floor((zone.w ?? 1) / 2),
    y: zone.y + Math.floor((zone.h ?? 1) / 2),
  }
  return { map: { ...map, spawns: [...(map.spawns ?? []), spawn] }, entrySpawnId: LAST_ROOM_SPAWN }
}
