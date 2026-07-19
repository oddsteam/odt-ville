// What can happen when the player arrives on a town tile, as one declarative
// list. The movement module's `onArrive` callback consults this; the scene
// wires the side effects (bus emit + scene transition, scene pause/launch).
//
// Pure and Phaser-free — it reads the plain `town`/`buildings`/`sightCells`
// data and returns ordered outcome descriptors. The order is the rule: a door
// tile short-circuits to entering the community; otherwise a trainer sight
// cell is resolved before the wild-grass roll on the same tile. The random
// roll and grace-step rate limiting stay in the scene; this only says *which*
// interactions apply, not how the stateful ones resolve.

import { tileChar } from '../town.ts'

export interface Tile {
  x: number
  y: number
}

interface Building {
  doorCol: number
  doorRow: number
  community: { entry_gate?: string | null } & Record<string, unknown>
}

interface TownLike {
  rows: number
  cols: number
  map: string[]
}

export interface TownContext {
  town: TownLike
  buildings: Building[]
  // The active trainer's line-of-sight cells; pass `[]` when there is no
  // trainer or he's already defeated.
  sightCells: Tile[]
}

export type TownInteraction =
  // gate is the house's entry requirement (e.g. 'posture-login') or null when
  // the door opens immediately; the scene branches on it. See issue #24.
  | { kind: 'enterCommunity'; community: unknown; gate: string | null }
  | { kind: 'startDuel' }
  | { kind: 'maybeWild' }

// The door as a Portal (#111, ADR-0005): a community carrying an authored
// interior Node makes its door travel — the same `portal` payload #84's travel
// dispatches. `entry` is the conventional id of an interior's entry spawn.
// Null (no authored interior) keeps the hardcoded InteriorScene, the v0 Node.
export function interiorPortal(community: {
  interior_node_slug?: string | null
}): { kind: 'portal'; targetNode: string; entrySpawnId: string } | null {
  const slug = community.interior_node_slug
  return slug ? { kind: 'portal', targetNode: slug, entrySpawnId: 'entry' } : null
}

export function townInteractionsAt(ctx: TownContext, tile: Tile): TownInteraction[] {
  const door = ctx.buildings.find((b) => b.doorCol === tile.x && b.doorRow === tile.y)
  if (door) {
    return [{ kind: 'enterCommunity', community: door.community, gate: door.community.entry_gate ?? null }]
  }

  const out: TownInteraction[] = []
  if (ctx.sightCells.some((c) => c.x === tile.x && c.y === tile.y)) out.push({ kind: 'startDuel' })
  if (tileChar(ctx.town, tile.x, tile.y) === 'g') out.push({ kind: 'maybeWild' })
  return out
}
