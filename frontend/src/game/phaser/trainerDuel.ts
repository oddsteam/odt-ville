// Resolving a fired trainer Zone (#259) into a duel. A `{ kind:'trainer', npcId }`
// payload names *which* NPC challenges you; this maps that id, against the loaded
// NPC catalog, into the opponent shape EncounterScene launches with. Pure and
// catalog-type-free (a structural NpcLike) so it stays inside the game black box
// — the shell fetches the catalog and hands it in, the way it does the monster
// pool. `facing`/`range` are read off the Zone by the detector, never here.

// The fields of a catalog NPC this resolver reads — structurally the shell's
// Npc row, but not imported from the catalog module (the game never depends on
// a data service, ADR-0004/depcruiser).
export interface NpcLike {
  id: number
  name: string
  level: number | null
  image: string
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

export function npcOpponent(npc: NpcLike): TrainerOpponent {
  return { kind: 'trainer', id: npc.id, name: npc.name, level: npc.level, sprite: npc.image }
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
