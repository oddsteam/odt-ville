// The Zone/Trigger detector (#85, ADR-0004/0005) — the pure half of the one
// `onZone(trigger, zone)` channel. It maps an avatar step against the map's
// zones and returns the events that step fires; the scene emits them, the
// shell dispatches on `payload.kind`. Only `on_enter` is a step mechanic:
// `on_sight` (facing cone, #86) and `interact` (key-press, #110) fire from
// other inputs, so a step never fires them — and a Prop is not a Zone, so an
// ambient billboard can never reach this channel at all.

import type { SightZone, Zone, ZoneTrigger } from './schema.ts'

export interface ZoneEvent {
  trigger: ZoneTrigger
  zone: Zone
}

// Point-in-rect over the zone's w×h footprint (absent w/h mean one tile). The
// one home for this rule (#524): the runtime detector, the decorate editor's
// hit-test (maps/zoneAuthor.ts), and the voice meeting resolver (voice/room.ts)
// all read it here rather than each spelling the half-open [x,x+w)×[y,y+h) span.
export const inZone = (z: Zone, x: number, y: number) =>
  x >= z.x && x < z.x + (z.w ?? 1) && y >= z.y && y < z.y + (z.h ?? 1)

// `on_enter` is edge-triggered: it fires only when the step crosses from
// outside the zone to inside, so walking within it never re-fires a portal or
// a link. The one exception is an `encounter` payload (#255): grass rolls
// every step — the GB rhythm — so it is level-triggered, firing on each step
// that lands inside; the shell's rate/grace gate owns how often that becomes
// an actual encounter.
export function zoneEvents(
  from: { x: number; y: number },
  to: { x: number; y: number },
  zones: readonly Zone[] = [],
): ZoneEvent[] {
  return zones
    .filter(
      (z) =>
        z.trigger === 'on_enter' &&
        inZone(z, to.x, to.y) &&
        (z.payload.kind === 'encounter' || !inZone(z, from.x, from.y)),
    )
    .map((zone) => ({ trigger: zone.trigger, zone }))
}

// The trainer's line of sight (#86): `range` tiles straight ahead of (x,y) in
// `facing`, nearest first, never the trainer's own tile. The schema union
// guarantees a sight zone has a facing, so there is no blind case to defend
// against here. Exported because the decorate editor draws the same cells the
// runtime fires on (#256) — the geometry lives here once, not per caller.
// ponytail: unclipped; the map-bounds clip belongs to whoever has the map
// (the hometown generator, #255), not to every caller.
export function sightCells(z: SightZone): { x: number; y: number }[] {
  const dx = z.facing === 'left' ? -1 : z.facing === 'right' ? 1 : 0
  const dy = z.facing === 'up' ? -1 : z.facing === 'down' ? 1 : 0
  return Array.from({ length: z.range ?? 1 }, (_, i) => ({
    x: z.x + dx * (i + 1),
    y: z.y + dy * (i + 1),
  }))
}

const inSight = (z: SightZone, x: number, y: number) =>
  sightCells(z).some((c) => c.x === x && c.y === y)

// `on_sight` is edge-triggered like `on_enter`: it fires the step that walks
// into the cone, so crossing it in front of the trainer challenges once and
// walking on within it stays quiet.
export function sightZoneEvents(
  from: { x: number; y: number },
  to: { x: number; y: number },
  zones: readonly Zone[] = [],
): ZoneEvent[] {
  return zones
    .filter((z) => z.trigger === 'on_sight' && inSight(z, to.x, to.y) && !inSight(z, from.x, from.y))
    .map((zone) => ({ trigger: zone.trigger, zone }))
}

// `interact` fires only from a key-press (#110): the caller invokes this on the
// press, against the tile the avatar stands on and the one it faces — a zone
// covering either fires once, and walking past never calls this at all.
export function interactZoneEvents(
  at: { x: number; y: number },
  faced: { x: number; y: number },
  zones: readonly Zone[] = [],
): ZoneEvent[] {
  return zones
    .filter((z) => z.trigger === 'interact' && (inZone(z, at.x, at.y) || inZone(z, faced.x, faced.y)))
    .map((zone) => ({ trigger: zone.trigger, zone }))
}
