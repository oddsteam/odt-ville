// Zone-authoring model (#90, ADR-0005). The decorate editor places Zones —
// interactive trigger + payload regions — the way it places Props: pure grid
// ops, Phaser-free. A new zone is one tile with the kind's conventional
// trigger and the smallest payload that saves cleanly (a portal targets the
// reserved `town` node, always valid); the inspector edits it from there.
// Lookup and erase hit any cell of a zone's w×h rect, topmost (last placed)
// winning where rects overlap.

import type { Zone, ZonePayload, ZoneTrigger } from '../kernel/schema.ts'

export type ZoneKind = ZonePayload['kind']

// Placement never seeds an aiming zone — a cone needs a direction the click
// can't know, so an author picks `on_sight` from the inspector (retrigger).
const seeds: Record<ZoneKind, { trigger: 'on_enter' | 'interact'; payload: ZonePayload }> = {
  portal: { trigger: 'on_enter', payload: { kind: 'portal', targetNode: 'town' } },
  link: { trigger: 'interact', payload: { kind: 'link', url: '' } },
  // A trainer is conceptually an aiming zone, but placement can't seed a cone
  // (see above) — the author switches to on_sight from the inspector, which
  // adds the facing. npcId 0 is the unset sentinel the inspector's NPC dropdown
  // replaces with a real catalog row before the map is worth saving (#259).
  trainer: { trigger: 'on_enter', payload: { kind: 'trainer', npcId: 0 } },
}

export function newZone(kind: ZoneKind, x: number, y: number): Zone {
  return { ...seeds[kind], x, y }
}

// Switch a zone's trigger, keeping the shape legal (#86). The schema union
// ties `facing` to `on_sight`, so the switch has to carry the aim across:
// start aiming and the zone gets a default facing (already-aiming keeps its
// own), stop aiming and the cone fields go with it rather than lingering as
// dead data on a portal.
export function retrigger(zone: Zone, trigger: ZoneTrigger): Zone {
  if (trigger === 'on_sight') {
    return zone.trigger === 'on_sight' ? zone : { ...zone, trigger, facing: 'down' }
  }
  const { x, y, w, h, payload } = zone
  return { trigger, x, y, w, h, payload }
}

// Point-in-rect over the zone's w×h footprint (absent w/h mean one tile) —
// the same rule the runtime detector applies (kernel/zones.ts inZone).
const covers = (z: Zone, x: number, y: number) =>
  x >= z.x && x < z.x + (z.w ?? 1) && y >= z.y && y < z.y + (z.h ?? 1)

// The zone a click at (x,y) selects: the topmost (last placed), or -1.
export function zoneIndexAt(zones: readonly Zone[], x: number, y: number): number {
  return zones.findLastIndex((z) => covers(z, x, y))
}

// Remove the topmost zone covering the cell; off every zone it's a no-op
// (returns the input).
export function eraseZoneAt(zones: readonly Zone[], x: number, y: number): Zone[] {
  const i = zoneIndexAt(zones, x, y)
  return i < 0 ? (zones as Zone[]) : zones.filter((_, j) => j !== i)
}

// Swap the zone at the index — the inspector's edit write-back.
export function replaceZone(zones: readonly Zone[], i: number, zone: Zone): Zone[] {
  return zones.map((z, j) => (j === i ? zone : z))
}
