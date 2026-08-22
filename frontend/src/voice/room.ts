// The meeting room resolver (#486). Membership stops being a pure function of
// distance and becomes a function of *position*: standing inside an authored
// meeting rect drops you into that room's call; stepping out returns you to the
// map's proximity room. This module is handed the rects as plain data — it never
// imports the map or the Phaser scene (voice-depends-only-on-shared-infrastructure).

import { roomKey } from './schema.ts'
import type { VoicePosition } from './schema.ts'
import type { Zone } from '../kernel/schema.ts'

// A meeting zone reduced to what the resolver needs: an anchored w×h rect and
// the room it names. Absent w/h mean one tile — same convention as an authored
// Zone's geometry (kernel schema `zoneRect`).
export interface MeetingRect {
  x: number
  y: number
  w?: number
  h?: number
  roomId: string
}

// Rects are half-open, [x, x+w) × [y, y+h): the near corner is inside, the far
// edge is not — so two rects that share an edge never both claim a tile.
const inRect = (t: VoicePosition, r: MeetingRect): boolean =>
  t.x >= r.x && t.x < r.x + (r.w ?? 1) && t.y >= r.y && t.y < r.y + (r.h ?? 1)

// Which room does standing at `tile` put you in? The first rect that contains
// the tile wins (deterministic under overlap); with no hit you are in the
// proximity room. Returns a full room key so the caller switches on identity.
export function resolveRoom(
  tile: VoicePosition,
  rects: readonly MeetingRect[],
  proximityRoom: string,
): string {
  const hit = rects.find((r) => inRect(tile, r))
  return hit ? roomKey({ kind: 'meeting', roomId: hit.roomId }) : proximityRoom
}

// Reduce a map's authored zones to the meeting rects the resolver reads. Lives
// here (not in the game) so both map entry paths hand voice the same plain data.
export function meetingRectsOf(zones: readonly Zone[] | undefined): MeetingRect[] {
  return (zones ?? []).flatMap((z) =>
    z.payload.kind === 'meeting'
      ? [{ x: z.x, y: z.y, w: z.w, h: z.h, roomId: z.payload.roomId }]
      : [],
  )
}
