// Placed NPCs as live runtime entities (#295): each stamped sprite gets its own
// rig and idle loop, the live entity owns the cell it blocks, and NPCs sort
// against the avatar's row. Uses a structural fake scene, the same way the
// per-sheet rig test does — no Phaser.

import { describe, expect, it } from 'vitest'
import { spawnNpcs, npcBlockedFor, npcDepth, sortNpcs } from './mapNpcs.ts'
import { MAP_PLAYER_DEPTH } from './mapWalk.ts'
import { npcSheetKey } from '../../kernel/mapRenderer.ts'
import { normalizeManifest } from '../../kernel/characterManifest.js'

const frame = (x: number) => ({ x, y: 0, w: 32, h: 64 })

function fakeSprite() {
  const s: any = { played: [], stopped: 0, frameSet: null, depth: 0, pos: null }
  s.anims = { play: (k: string) => s.played.push(k), stop: () => s.stopped++ }
  s.setFlipX = () => s
  s.setFrame = (f: string) => ((s.frameSet = f), s)
  s.setDepth = (d: number) => ((s.depth = d), s)
  s.setPosition = (x: number, y: number) => ((s.pos = { x, y }), s)
  return s
}

// A scene holding the kernel's stamps plus the rigs the shell supplied.
function fakeScene(stamps: Array<{ entity: any; sprite: any }>, rigs: Array<{ id: number; manifest: any }>) {
  const frames = new Map<string, Set<string>>()
  for (const r of rigs) frames.set(npcSheetKey(r.id), new Set())
  const anims = new Set<string>()
  return {
    _npcSprites: stamps,
    _bakedNpcs: rigs,
    animKeys: anims,
    textures: {
      exists: (k: string) => frames.has(k),
      get: (k: string) => ({
        has: (n: string) => frames.get(k)!.has(n),
        add: (n: string) => void frames.get(k)!.add(n),
      }),
    },
    anims: {
      exists: (k: string) => anims.has(k),
      create: (cfg: { key: string }) => void anims.add(cfg.key),
    },
  }
}

const npcEntity = (npc_id: number, x: number, y: number, facing = 'down') => ({
  kind: 'npc',
  npc_id,
  x,
  y,
  facing,
})

describe('spawnNpcs', () => {
  it('gives two NPCs on different rigs their own frames and loops', () => {
    const a = fakeSprite()
    const b = fakeSprite()
    const scene = fakeScene(
      [
        { entity: npcEntity(1, 0, 0), sprite: a },
        { entity: npcEntity(2, 4, 4), sprite: b },
      ],
      [
        { id: 1, manifest: normalizeManifest({ postures: { idleDown: [frame(0), frame(32)] } }) },
        { id: 2, manifest: normalizeManifest({ postures: { idleDown: [frame(0), frame(32)] } }) },
      ],
    )

    const npcs = spawnNpcs(scene)

    expect(npcs).toHaveLength(2)
    // Each animates from its own sheet — one rig's loop can never drive the other.
    expect(a.played).toEqual([`${npcSheetKey(1)}.anim.idleDown`])
    expect(b.played).toEqual([`${npcSheetKey(2)}.anim.idleDown`])
  })

  it('leaves a single-frame idle static instead of looping it', () => {
    const s = fakeSprite()
    const scene = fakeScene(
      [{ entity: npcEntity(1, 2, 2, 'up'), sprite: s }],
      [{ id: 1, manifest: normalizeManifest({ postures: { idleUp: [frame(0)] } }) }],
    )

    spawnNpcs(scene)

    expect(s.played).toEqual([])
    expect(s.frameSet).toBe('idleUp.0')
  })

  it('spawns nothing for an NPC the renderer could not draw', () => {
    // A dangling npc_id or a rig-less NPC never got a stamp, so there is no live
    // entity — and therefore no blocked cell with nothing drawn on it.
    const npcs = spawnNpcs(fakeScene([], [{ id: 9, manifest: normalizeManifest({}) }]))
    expect(npcs).toEqual([])
    expect(npcBlockedFor(npcs)(0, 0)).toBe(false)
  })
})

describe('npcBlockedFor', () => {
  it('blocks the cell the live entity stands on', () => {
    const npcs = [{ tile: { x: 2, y: 3 } }]
    const blocked = npcBlockedFor(npcs)
    expect(blocked(2, 3)).toBe(true)
    expect(blocked(2, 4)).toBe(false)
  })

  it('moves the blocked cell with the NPC, leaving no invisible wall', () => {
    const s = fakeSprite()
    const scene = fakeScene(
      [{ entity: npcEntity(1, 2, 3), sprite: s }],
      [{ id: 1, manifest: normalizeManifest({ postures: { idleDown: [frame(0)] } }) }],
    )
    const npcs = spawnNpcs(scene)
    const blocked = npcBlockedFor(npcs)

    npcs[0].moveTo(5, 6)

    // The authored anchor is free the moment the NPC leaves it...
    expect(blocked(2, 3)).toBe(false)
    // ...and the cell it now occupies is the blocked one.
    expect(blocked(5, 6)).toBe(true)
    // The sprite came along, so what blocks is what's drawn.
    expect(s.pos).not.toBeNull()
  })
})

describe('npcDepth', () => {
  it('draws an NPC south of the avatar over it, one north of it under', () => {
    expect(npcDepth(4, 3)).toBeGreaterThan(MAP_PLAYER_DEPTH)
    expect(npcDepth(2, 3)).toBeLessThan(MAP_PLAYER_DEPTH)
    // Level with the avatar they never overlap, so either order reads right —
    // pin it as "under" so a step onto that row can't flicker.
    expect(npcDepth(3, 3)).toBeLessThan(MAP_PLAYER_DEPTH)
  })

  it('re-sorts every NPC against the avatar row it is handed', () => {
    const north = { tile: { x: 0, y: 1 }, sprite: fakeSprite() }
    const south = { tile: { x: 0, y: 5 }, sprite: fakeSprite() }
    sortNpcs([north, south], 3)
    expect(north.sprite.depth).toBeLessThan(MAP_PLAYER_DEPTH)
    expect(south.sprite.depth).toBeGreaterThan(MAP_PLAYER_DEPTH)
  })
})
