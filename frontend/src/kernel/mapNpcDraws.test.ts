// The placed-NPC draw (#294, the pure half). An npc entity resolves its art
// through the rig the catalog row points at — the same framesForFacing the
// runtime character uses — so the authored pose in the editor preview cannot
// drift from what the game shows. Stamping lives in Phaser and is exercised by
// the scene.

import { describe, expect, it } from 'vitest'
import { bakedDraws, npcSheetKey, type NpcRig } from './mapRenderer.ts'
import type { BakedMap } from './schema.ts'
import { TILE } from './constants.ts'

// A rig with its own left/up postures and a 32×64 frame, like a mapped sheet.
const RIG = {
  render: { originX: 0.5, originY: 1, scale: 1 },
  postures: {
    idleDown: [{ x: 0, y: 0, w: 32, h: 64 }],
    idleUp: [{ x: 64, y: 0, w: 32, h: 64 }],
  },
}
const RIGS = new Map<number, NpcRig>([[7, RIG]])

const mapWith = (entities: BakedMap['entities']): BakedMap => ({
  slug: 'm',
  title: 'M',
  cols: 4,
  rows: 4,
  tilesets: [{ name: 'grass', cell: 16 }],
  tiles: [[{ tileset: 'grass', frame: 0 }]],
  entities,
})

const npcDraw = (entities: BakedMap['entities'], rigs = RIGS) =>
  bakedDraws(mapWith(entities), undefined, rigs).find((d) => d.key === npcSheetKey(7))

describe('bakedDraws for a placed NPC', () => {
  it('draws the rig frame for the authored facing', () => {
    const d = npcDraw([{ kind: 'npc', npc_id: 7, x: 1, y: 2, facing: 'up' }])
    expect(d).toMatchObject({ rect: { x: 64, y: 0, w: 32, h: 64 }, flipX: false })
    // Stands in its cell the way the avatar does: bottom-centre anchored, so a
    // two-tile-tall sprite rises out of the tile instead of hanging below it.
    expect(d).toMatchObject({ x: 1.5, y: 3, originX: 0.5, originY: 1 })
    // Scaled, not display-sized: an animating rig's frames differ in size, so
    // the stamp scales source px like the avatar's rig does (#295).
    expect(d?.scale).toBeCloseTo(TILE / 32)
  })

  it('carries the source entity, so the runtime can rig and command it (#295)', () => {
    const d = npcDraw([{ kind: 'npc', npc_id: 7, x: 1, y: 2, facing: 'up' }])
    expect(d?.npc).toMatchObject({ kind: 'npc', npc_id: 7, x: 1, y: 2, facing: 'up' })
  })

  it('falls back to the down posture, flipped, for a facing the rig lacks', () => {
    const d = npcDraw([{ kind: 'npc', npc_id: 7, x: 0, y: 0, facing: 'left' }])
    expect(d).toMatchObject({ rect: { x: 0, y: 0, w: 32, h: 64 }, flipX: true })
  })

  it('poses a facing-less legacy npc entity down', () => {
    const d = npcDraw([{ kind: 'npc', npc_id: 7, x: 0, y: 0 }])
    expect(d?.rect).toEqual({ x: 0, y: 0, w: 32, h: 64 })
  })

  it('draws nothing for a dangling npc_id or a rig with no frames', () => {
    expect(npcDraw([{ kind: 'npc', npc_id: 7, x: 0, y: 0 }], new Map())).toBeUndefined()
    expect(npcDraw([{ kind: 'npc', npc_id: 7, x: 0, y: 0 }], new Map([[7, { postures: {} }]]))).toBeUndefined()
    // …and the map's ground still draws, so the preview survives it.
    expect(bakedDraws(mapWith([{ kind: 'npc', npc_id: 9, x: 0, y: 0 }]), undefined, RIGS)).toHaveLength(1)
  })
})
