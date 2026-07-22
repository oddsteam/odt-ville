// NPC placement model (#294). A placed NPC is a *reference* to a catalog NPC
// row — `{kind:"npc", npc_id, x, y, facing}` — stamped on one tile, the same
// reference discipline a Prop uses for a tile object (ADR-0008): identity, the
// rig that draws it and the level live on the row, so editing the NPC restyles
// every map that placed it. One tile each (a person is not a footprint), so the
// grid ops are point lookups rather than props.ts's rect maths. Pure and
// Phaser-free.

import type { BakedEntity, ZoneFacing } from '../kernel/schema.ts'

// An NPC stamped on the grid, posed at a facing. Display data (name, rig) is
// looked up from the fetched catalog by id — the placed model is the reference.
export interface PlacedNpc {
  npc_id: number
  x: number
  y: number
  facing: ZoneFacing
}

// The pose a fresh stamp starts in — a click can't know which way to look, so
// it faces the player's default and the inspector turns it from there.
export const NPC_FACING_DEFAULT: ZoneFacing = 'down'

// Stamp an NPC, replacing whatever stood on that cell (a re-stamp swaps, a move
// is erase-then-place). Fresh list.
export function placeNpc(npcs: readonly PlacedNpc[], npc: PlacedNpc): PlacedNpc[] {
  return [...npcs.filter((n) => n.x !== npc.x || n.y !== npc.y), npc]
}

// Remove the NPC on a cell. Off any NPC it's a no-op (returns the input).
export function eraseNpcAt(npcs: readonly PlacedNpc[], x: number, y: number): PlacedNpc[] {
  const next = npcs.filter((n) => n.x !== x || n.y !== y)
  return next.length === npcs.length ? (npcs as PlacedNpc[]) : next
}

// Which NPC a click lands on, for the inspector; -1 off any.
export function npcIndexAt(npcs: readonly PlacedNpc[], x: number, y: number): number {
  return npcs.findIndex((n) => n.x === x && n.y === y)
}

// Bake the placed NPCs into the runtime's entity list. Each carries `walk_mask:
// ["#"]` so its cell blocks through the existing entity walk rule
// (mapWalk.entityBlockedFor reads the mask off any entity kind) — you cannot
// walk through a person, and no new collision code is needed for it. The mask is
// the *initial* state, anchored at the authored cell, and mirrors `facing`'s
// lifetime: once the NPC walks it is wrong (blocking the cell it left), and
// making collision follow it belongs to the runtime slice, not here.
// ponytail: blocking is unconditional; a walk-through NPC (a ghost, a background
// extra) is a flag added when something needs one.
export function npcEntities(npcs: readonly PlacedNpc[]): BakedEntity[] {
  return npcs.map((n) => ({
    kind: 'npc',
    npc_id: n.npc_id,
    x: n.x,
    y: n.y,
    facing: n.facing,
    walk_mask: ['#'],
  }))
}

// Reconstruct the editor's placed-NPC list from a loaded map's entities. A
// pre-facing document reads back as the default pose rather than failing.
export function npcsFromBaked(entities: readonly BakedEntity[]): PlacedNpc[] {
  return entities
    .filter((e) => e.kind === 'npc' && e.npc_id != null)
    .map((e) => ({ npc_id: e.npc_id!, x: e.x, y: e.y, facing: e.facing ?? NPC_FACING_DEFAULT }))
}
