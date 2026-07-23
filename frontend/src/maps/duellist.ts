// Duellist projection (#296). Marking a *placed* NPC a duellist emits its
// trainer sight cone from the NPC's own facing, instead of the author drawing a
// separate on_sight trainer Zone by hand and keeping the two facings in sync.
// The cone's facing is derived — owned by the NPC — so a sprite that looks left
// can never silently watch down (#294's payoff). `range`/footprint stay authored
// on the Zone (the zones inspector); only facing + which NPC are locked here.
//
// A seeded cone is an on_sight trainer Zone tagged `payload.fromNpc`, anchored
// at the NPC's own cell and naming it. That tag is the whole guard: an untagged
// (hand-authored) trainer Zone is never adopted, re-pointed, or cascade-deleted
// by the NPC gesture. Pure and Phaser-free.

import type { SightZone, Zone } from '../kernel/schema.ts'
import type { PlacedNpc } from './npcs.ts'

// The seeded cone belonging to the placed NPC at (npc.x, npc.y): the tag, the
// cell, and the id must all match.
const isSeededFor = (z: Zone, npc: PlacedNpc): boolean =>
  z.trigger === 'on_sight' &&
  z.payload.kind === 'trainer' &&
  z.payload.fromNpc === true &&
  z.x === npc.x &&
  z.y === npc.y &&
  z.payload.npcId === npc.npc_id

// The cone a fresh mark emits: on_sight at the NPC's cell, facing the NPC, a
// trainer payload naming it. No `range` → the tile directly in front; the author
// widens it (and w/h) in the zones inspector.
const newDuellistZone = (npc: PlacedNpc): SightZone => ({
  trigger: 'on_sight',
  x: npc.x,
  y: npc.y,
  facing: npc.facing,
  payload: { kind: 'trainer', npcId: npc.npc_id, fromNpc: true },
})

export const isDuellist = (zones: readonly Zone[], npc: PlacedNpc): boolean =>
  zones.some((z) => isSeededFor(z, npc))

// Emit the NPC's cone if it has none yet — idempotent, never a duplicate. A
// hand-authored trainer already on the cell is a different, untagged Zone and is
// left in place.
export function markDuellist(zones: readonly Zone[], npc: PlacedNpc): Zone[] {
  return isDuellist(zones, npc) ? (zones as Zone[]) : [...zones, newDuellistZone(npc)]
}

// Drop the NPC's seeded cone; untagged zones untouched. Off a non-duellist it's
// a no-op (same list back).
export function unmarkDuellist(zones: readonly Zone[], npc: PlacedNpc): Zone[] {
  const next = zones.filter((z) => !isSeededFor(z, npc))
  return next.length === zones.length ? (zones as Zone[]) : next
}

// Reconcile every seeded cone to the current NPC list — the derived-facing
// contract. Turning an NPC re-points its cone; deleting it (or stamping another
// NPC onto its cell) drops the cone. `range`/footprint are preserved; untagged
// trainer Zones are never touched. Returns the same array when nothing changes,
// so it's safe to run on every NPC edit.
export function syncDuellistZones(zones: readonly Zone[], npcs: readonly PlacedNpc[]): Zone[] {
  let changed = false
  const next = zones.flatMap((z) => {
    if (z.trigger !== 'on_sight' || z.payload.kind !== 'trainer' || !z.payload.fromNpc) return [z]
    const payload = z.payload
    const npc = npcs.find((n) => n.x === z.x && n.y === z.y && n.npc_id === payload.npcId)
    if (!npc) return (changed = true), [] // owner gone (deleted or overwritten) → drop
    if (z.facing === npc.facing) return [z]
    return (changed = true), [{ ...z, facing: npc.facing }] // re-point, keep range/w/h
  })
  return changed ? next : (zones as Zone[])
}
