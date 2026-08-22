// The meeting room resolver (#486). Membership stops being a pure function of
// distance and becomes a function of *position*: standing inside an authored
// meeting zone drops you into that room's call; stepping out returns you to the
// map's proximity room. This module reads the map's authored zones as plain data
// — it never imports the map or the Phaser scene (the kernel Zone shape is shared
// infrastructure, voice-depends-only-on-shared-infrastructure).

import { inZone } from '../kernel/zones.ts'
import { roomKey } from './schema.ts'
import type { VoicePosition } from './schema.ts'
import type { Zone } from '../kernel/schema.ts'

// Which room does standing at `tile` put you in? The first authored meeting zone
// containing the tile wins (deterministic under overlap); with no hit you are in
// the proximity room. Point-in-rect is the kernel's `inZone` (#524) — the one
// half-open [x,x+w)×[y,y+h) rule the zone detector already applies, so two zones
// that share an edge never both claim a tile. Returns a full room key so the
// caller switches on identity.
export function resolveRoom(
  tile: VoicePosition,
  zones: readonly Zone[] | undefined,
  proximityRoom: string,
): string {
  for (const z of zones ?? []) {
    if (z.payload.kind === 'meeting' && inZone(z, tile.x, tile.y)) {
      return roomKey({ kind: 'meeting', roomId: z.payload.roomId })
    }
  }
  return proximityRoom
}
