// Resolving a fired trainer Zone (#259) into a duel. A `{ kind:'trainer', npcId }`
// payload names *which* NPC challenges you; this maps that id, against the loaded
// NPC catalog, into the opponent shape EncounterScene launches with. Pure and
// catalog-type-free (a structural NpcLike) so it stays inside the game black box
// — the shell fetches the catalog and hands it in, the way it does the monster
// pool. `facing`/`range` are read off the Zone by the detector, never here.

import { GATE_TRAINER } from '../encounters.js'

// The fields of a catalog NPC this resolver reads — structurally the shell's
// Npc row, but not imported from the catalog module (the game never depends on
// a data service, ADR-0004/depcruiser).
export interface NpcLike {
  id: number
  name: string
  level: number | null
}

// The EncounterScene opponent for a trainer duel: identity plus the sprite URL
// it loads. `kind: 'trainer'` picks the trainer framing (RUN AWAY, persistent
// escape); a null level omits the "Lv." line, matching an authored monster.
export interface TrainerOpponent {
  kind: 'trainer'
  id: number
  name: string
  level: number | null
  sprite: string
}

// #260: an NPC's art is a mapped rig (a sheet plus posture rects) while
// EncounterScene loads a whole image, so there is no portrait to hand it yet.
// The authored identity — name, level — still comes from the catalog row; only
// the portrait falls back to the bundled boss, the same still `gateTrainerOpponent`
// already shows when the catalog can't resolve at all. Every trainer therefore
// duels wearing the same face until a follow-up teaches the duel to draw a rig
// frame; nothing regresses to a broken/blank sprite in the meantime.
export function npcOpponent(npc: NpcLike): TrainerOpponent {
  return {
    kind: 'trainer',
    id: npc.id,
    name: npc.name,
    level: npc.level,
    sprite: GATE_TRAINER.sprite,
  }
}

// Resolve a trainer payload's npcId against the loaded catalog. Null when the
// NPC is missing — the unset sentinel (npcId 0 a freshly placed zone carries) or
// a row deleted since the map was authored — so the caller starts no duel and a
// dangling reference is a quiet no-op, not a crash.
export function trainerOpponent(
  npcs: readonly NpcLike[],
  npcId: number,
): TrainerOpponent | null {
  const npc = npcs.find((n) => n.id === npcId)
  return npc ? npcOpponent(npc) : null
}
