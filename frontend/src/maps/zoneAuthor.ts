// Zone-authoring model (#90, ADR-0005). The decorate editor places Zones —
// interactive trigger + payload regions — the way it places Props: pure grid
// ops, Phaser-free. A new zone is one tile with the kind's conventional
// trigger and the smallest payload that saves cleanly (a portal targets the
// reserved `town` node, always valid); the inspector edits it from there.
// Lookup and erase hit any cell of a zone's w×h rect, topmost (last placed)
// winning where rects overlap.

import { inZone } from '../kernel/zones.ts'
import type { BakedMap, Zone, ZonePayload, ZoneTrigger } from '../kernel/schema.ts'

export type ZoneKind = ZonePayload['kind']

// The map handed to the WYSIWYG decorate preview (#493). It must carry the *live*
// authored zones and entities, not the ones baked at load — the Phaser preview's
// blink glow (renderZoneBlink) reads map.zones, so a deleted link zone keeps
// pulsing until this reflects the edit. Pure merge; the page memoises it over the
// edit state so the preview rebuilds whenever a zone changes.
export function previewMapOf(baked: BakedMap, zones: readonly Zone[], entities: BakedMap['entities']): BakedMap {
  return { ...baked, zones: [...zones], entities }
}

// Placement never seeds an aiming zone — a cone needs a direction the click
// can't know, so an author picks `on_sight` from the inspector (retrigger).
// `meeting` is seeded in newZone rather than here: its roomId is a *generated*
// slug (unique per placement), which a static literal can't be.
const seeds: Record<Exclude<ZoneKind, 'meeting'>, { trigger: 'on_enter' | 'interact'; payload: ZonePayload }> = {
  portal: { trigger: 'on_enter', payload: { kind: 'portal', targetNode: 'town' } },
  link: { trigger: 'interact', payload: { kind: 'link', url: '' } },
  // A trainer is conceptually an aiming zone, but placement can't seed a cone
  // (see above) — the author switches to on_sight from the inspector, which
  // adds the facing. npcId 0 is the unset sentinel the inspector's NPC dropdown
  // replaces with a real catalog row before the map is worth saving (#259).
  trainer: { trigger: 'on_enter', payload: { kind: 'trainer', npcId: 0 } },
  // An encounter fires when the avatar steps onto it (on_enter), rolling a wild
  // from the named pool. The empty pool seed rolls the whole global pool — a
  // valid save from the first click (like portal's reserved town target); the
  // inspector names a specific group from there (#87).
  encounter: { trigger: 'on_enter', payload: { kind: 'encounter', pool: '' } },
}

export function newZone(kind: ZoneKind, x: number, y: number): Zone {
  // A meeting room's roomId is author-assigned (#485), seeded with a generated
  // slug so the zone saves without further editing (the validator rejects a
  // blank one) and two rooms on a map never collide. Generated, not derived
  // from (x,y), so moving the rect doesn't strand people in a different room.
  if (kind === 'meeting') {
    return { trigger: 'on_enter', x, y, payload: { kind: 'meeting', roomId: `room-${crypto.randomUUID().slice(0, 8)}` } }
  }
  return { ...seeds[kind], x, y }
}

const ALL_TRIGGERS: readonly ZoneTrigger[] = ['on_enter', 'interact', 'on_sight']

// Which triggers a payload kind can legally carry, for the inspector's picker.
// An encounter is a stepped mechanic — the runtime rolls a wild when the avatar
// walks onto the region, and there is no press-to-roll or roll-across-a-cone —
// so offering the other two would author a zone that can never fire (#87).
// Every other kind stays open: a portal or link reads fine stepped or pressed,
// and a trainer aims.
// A meeting room joins the same way: you are in it when you stand inside its
// rect (#486), so on_enter is the only trigger that can fire it — press-to-meet
// and meet-across-a-cone are meaningless (#485), exactly like an encounter.
export function triggersFor(kind: ZoneKind): readonly ZoneTrigger[] {
  return kind === 'encounter' || kind === 'meeting' ? ['on_enter'] : ALL_TRIGGERS
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

// The zone a click at (x,y) selects: the topmost (last placed), or -1. Hit-test
// is the kernel's `inZone` — the same w×h footprint rule the runtime detector
// fires on (#524).
export function zoneIndexAt(zones: readonly Zone[], x: number, y: number): number {
  return zones.findLastIndex((z) => inZone(z, x, y))
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
