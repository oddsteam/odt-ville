// The Zone/Trigger detector (#85, ADR-0004/0005) — the pure half of the one
// `onZone(trigger, zone)` channel. It maps an avatar step against the map's
// zones and returns the events that step fires; the scene emits them, the
// shell dispatches on `payload.kind`. Only `on_enter` is a step mechanic:
// `on_sight` (facing cone, #86) and `interact` (key-press, #110) fire from
// other inputs, so a step never fires them — and a Prop is not a Zone, so an
// ambient billboard can never reach this channel at all.

import type { Zone, ZoneTrigger } from './schema.ts'

export interface ZoneEvent {
  trigger: ZoneTrigger
  zone: Zone
}

// Point-in-rect over the zone's w×h footprint (absent w/h mean one tile).
const inZone = (z: Zone, x: number, y: number) =>
  x >= z.x && x < z.x + (z.w ?? 1) && y >= z.y && y < z.y + (z.h ?? 1)

// `on_enter` is edge-triggered: it fires only when the step crosses from
// outside the zone to inside, so standing or walking within it never re-fires
// and a step elsewhere never false-fires.
export function zoneEvents(
  from: { x: number; y: number },
  to: { x: number; y: number },
  zones: readonly Zone[] = [],
): ZoneEvent[] {
  return zones
    .filter((z) => z.trigger === 'on_enter' && inZone(z, to.x, to.y) && !inZone(z, from.x, from.y))
    .map((zone) => ({ trigger: zone.trigger, zone }))
}
