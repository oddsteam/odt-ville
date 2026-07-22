// The NPC placement model (#294): a placed NPC is a catalog reference posed at
// a facing, and it blocks its cell. Pins the bake→read-back round trip and that
// the baked walk_mask reaches the existing entity collision rule unchanged.

import { describe, expect, it } from 'vitest'
import { placeNpc, eraseNpcAt, npcIndexAt, npcEntities, npcsFromBaked, type PlacedNpc } from './npcs.ts'
import { entityBlockedFor, entityOverhangFor } from '../game/phaser/mapWalk.ts'
import type { ZoneFacing } from '../kernel/schema.ts'

const npc = (npc_id: number, x: number, y: number, facing: ZoneFacing = 'down'): PlacedNpc => ({
  npc_id,
  x,
  y,
  facing,
})

describe('npc placement', () => {
  it('stamps one NPC per cell — a re-stamp replaces', () => {
    const placed = placeNpc(placeNpc([], npc(1, 2, 3)), npc(2, 2, 3))
    expect(placed).toEqual([npc(2, 2, 3)])
  })

  it('erases the NPC on a cell and leaves the rest', () => {
    const placed = [npc(1, 0, 0), npc(2, 1, 1)]
    expect(eraseNpcAt(placed, 1, 1)).toEqual([npc(1, 0, 0)])
    // Off any NPC it's a no-op — the same list comes back.
    expect(eraseNpcAt(placed, 5, 5)).toBe(placed)
  })

  it('finds the NPC under a cell for the inspector, -1 off one', () => {
    const placed = [npc(1, 0, 0), npc(2, 1, 1)]
    expect(npcIndexAt(placed, 1, 1)).toBe(1)
    expect(npcIndexAt(placed, 4, 4)).toBe(-1)
  })

  it('round-trips through the baked entities, facing included', () => {
    const placed = [npc(7, 2, 3, 'left')]
    const entities = npcEntities(placed)
    expect(entities[0]).toMatchObject({ kind: 'npc', npc_id: 7, x: 2, y: 3, facing: 'left' })
    expect(npcsFromBaked(entities)).toEqual(placed)
  })

  it('reads a facing-less legacy entity back as facing down', () => {
    expect(npcsFromBaked([{ kind: 'npc', npc_id: 7, x: 1, y: 1 }])).toEqual([npc(7, 1, 1)])
  })

  it('blocks its own cell through the existing entity walk rule', () => {
    const blocked = entityBlockedFor(npcEntities([npc(1, 2, 3)]))
    expect(blocked(2, 3)).toBe(true)
    expect(blocked(3, 3)).toBe(false)
  })

  it('overhangs the cell its head occupies, so an avatar north of it walks behind', () => {
    const overhang = entityOverhangFor(npcEntities([npc(1, 2, 3)]))
    expect(overhang(2, 2)).toBe(true)
    // Not beside it, and not the cell it stands on (which is blocked anyway).
    expect(overhang(1, 2)).toBe(false)
    expect(overhang(2, 4)).toBe(false)
  })
})
