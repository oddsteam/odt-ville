// The duellist projection (#296): marking a placed NPC emits an on_sight trainer
// cone seeded from its facing; the facing is derived (turning the NPC re-points
// the cone), deleting the NPC drops the cone, and hand-authored trainer Zones
// are never touched.

import { describe, expect, it } from 'vitest'
import { isDuellist, markDuellist, unmarkDuellist, syncDuellistZones } from './duellist.ts'
import type { PlacedNpc } from './npcs.ts'
import type { Zone } from '../kernel/schema.ts'

const npc = (npc_id: number, x: number, y: number, facing: PlacedNpc['facing'] = 'down'): PlacedNpc => ({
  npc_id,
  x,
  y,
  facing,
})

describe('duellist projection', () => {
  it('marks an NPC by emitting an on_sight trainer cone from its facing', () => {
    const zones = markDuellist([], npc(7, 2, 3, 'left'))
    expect(zones).toEqual([
      { trigger: 'on_sight', x: 2, y: 3, facing: 'left', payload: { kind: 'trainer', npcId: 7, fromNpc: true } },
    ])
    expect(isDuellist(zones, npc(7, 2, 3, 'left'))).toBe(true)
  })

  it('marking twice is idempotent — never a duplicate cone', () => {
    const once = markDuellist([], npc(7, 2, 3))
    expect(markDuellist(once, npc(7, 2, 3))).toBe(once)
  })

  it('unmark drops the seeded cone; off a non-duellist it is a no-op', () => {
    const zones = markDuellist([], npc(7, 2, 3))
    expect(unmarkDuellist(zones, npc(7, 2, 3))).toEqual([])
    const other: Zone[] = [{ trigger: 'on_enter', x: 0, y: 0, payload: { kind: 'portal', targetNode: 'town' } }]
    expect(unmarkDuellist(other, npc(9, 9, 9))).toBe(other)
  })

  it('turning the NPC re-points its cone, preserving an authored range', () => {
    const marked = markDuellist([], npc(7, 2, 3, 'down'))
    const widened = marked.map((z) => ({ ...z, range: 4 })) // author widens it in zones mode
    const turned = syncDuellistZones(widened, [npc(7, 2, 3, 'up')])
    expect(turned[0]).toMatchObject({ facing: 'up', range: 4, payload: { npcId: 7, fromNpc: true } })
  })

  it('deleting the NPC — or stamping another onto its cell — drops the cone', () => {
    const zones = markDuellist([], npc(7, 2, 3))
    expect(syncDuellistZones(zones, [])).toEqual([]) // deleted
    expect(syncDuellistZones(zones, [npc(8, 2, 3)])).toEqual([]) // overwritten by a different NPC
  })

  it('never touches a hand-authored trainer Zone, even one on the NPC cell', () => {
    // Untagged trainer cone at the same cell as an NPC facing the other way.
    const zones: Zone[] = [{ trigger: 'on_sight', x: 5, y: 5, facing: 'left', payload: { kind: 'trainer', npcId: 3 } }]
    expect(syncDuellistZones(zones, [npc(3, 5, 5, 'up')])).toBe(zones)
    expect(unmarkDuellist(zones, npc(3, 5, 5, 'up'))).toBe(zones)
    expect(isDuellist(zones, npc(3, 5, 5, 'up'))).toBe(false)
  })

  it('sync returns the same array when every cone already aims right', () => {
    const zones = markDuellist([], npc(7, 2, 3, 'down'))
    expect(syncDuellistZones(zones, [npc(7, 2, 3, 'down')])).toBe(zones)
  })
})
