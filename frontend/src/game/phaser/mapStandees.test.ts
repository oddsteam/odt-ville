// Standees as live runtime cutouts (#369, ADR-0015): each placed Standee gets a
// static idle-down cutout from the owner's rig, a dangling owner falls back to
// the bundled still, cutouts sort against the avatar's row — and, load-bearing,
// a cutout never reaches a walkability predicate. Structural fake scene, no
// Phaser, the same shape the placed-NPC spawn test uses.

import { describe, expect, it } from 'vitest'
import {
  spawnStandees,
  sortStandees,
  standeeAt,
  placardOf,
  addStandee,
  restandeeRigs,
  type LiveStandee,
} from './mapStandees.ts'
import { applyStandeeFrame, type StandeeNote } from '../standees.ts'
import { peerSheetKey } from './characterRig.js'
import { TILE } from '../constants.js'
import * as mapStandees from './mapStandees.ts'
import { npcBlockedFor } from './mapNpcs.ts'
import { mapWalkable, MAP_PLAYER_DEPTH } from './mapWalk.ts'
import { standeeSheetKey } from '../../kernel/mapRenderer.ts'
import { normalizeManifest } from '../../kernel/characterManifest.js'

const frame = (x: number) => ({ x, y: 0, w: 32, h: 64 })

function fakeSprite(key = '') {
  const s: any = { type: 'sprite', frameArg: null, depth: 0, scale: 1, flipX: false, origin: null, played: [] }
  s.texture = { key }
  s.destroyed = false
  s.destroy = () => (s.destroyed = true)
  s.anims = { play: (k: string) => s.played.push(k) }
  s.setOrigin = (x: number, y: number) => ((s.origin = { x, y }), s)
  s.setScale = (v: number) => ((s.scale = v), s)
  s.setFlipX = (v: boolean) => ((s.flipX = v), s)
  s.setDepth = (d: number) => ((s.depth = d), s)
  return s
}

function fakeImage(key = '') {
  const s: any = { type: 'image', depth: 0, size: null, origin: null }
  s.texture = { key }
  s.destroyed = false
  s.destroy = () => (s.destroyed = true)
  s.setOrigin = (x: number, y: number) => ((s.origin = { x, y }), s)
  s.setDisplaySize = (w: number, h: number) => ((s.size = { w, h }), s)
  s.setDepth = (d: number) => ((s.depth = d), s)
  return s
}

// A scene holding the shell's placed Standees plus the (loaded) rig sheets.
function fakeScene(standees: Array<{ id: number; x: number; y: number; message: string; manifest: any }>) {
  const frames = new Map<string, Set<string>>()
  for (const s of standees) if (s.manifest) frames.set(standeeSheetKey(s.id), new Set())
  const created: any[] = []
  return {
    _bakedStandees: standees,
    created,
    textures: {
      exists: (k: string) => frames.has(k),
      get: (k: string) => ({
        has: (n: string) => frames.get(k)!.has(n),
        add: (n: string) => void frames.get(k)!.add(n),
      }),
    },
    add: {
      sprite: (x: number, y: number, k: string, f: string) => {
        const s = fakeSprite(k)
        s.frameArg = f
        s.pos = { x, y }
        created.push(s)
        return s
      },
      image: (x: number, y: number, k: string) => {
        const s = fakeImage(k)
        s.pos = { x, y }
        created.push(s)
        return s
      },
    },
  }
}

const standee = (id: number, x: number, y: number, message = 'Jogging Sunday?') => ({
  id,
  x,
  y,
  message,
  manifest: normalizeManifest({ postures: { idleDown: [frame(0), frame(32)] } }),
})

describe('spawnStandees', () => {
  it('stamps a static idle-down cutout for each placed Standee', () => {
    const scene = fakeScene([standee(1, 2, 3), standee(2, 5, 6, 'Board games at 4')])

    const standees = spawnStandees(scene)

    expect(standees.map((s) => s.message)).toEqual(['Jogging Sunday?', 'Board games at 4'])
    expect(standees.map((s) => s.tile)).toEqual([{ x: 2, y: 3 }, { x: 5, y: 6 }])
    // Static — the idle-down first frame, never a loop (a Standee is an effigy).
    expect(scene.created.every((s) => s.frameArg === 'idleDown.0')).toBe(true)
    expect(scene.created.every((s) => s.played.length === 0)).toBe(true)
  })

  it('falls back to the bundled still for a dangling owner rather than crashing', () => {
    // Owner with no manifest (dangling reference) — no rig sheet was loaded, so
    // the cutout renders as the bundled fallback image, and it still spawns.
    const scene = fakeScene([{ id: 9, x: 1, y: 1, message: 'hi', manifest: null }])

    const standees = spawnStandees(scene)

    expect(standees).toHaveLength(1)
    expect(scene.created).toHaveLength(1)
    expect(scene.created[0].type).toBe('image')
  })
})

describe('a Standee never blocks', () => {
  it('exports no blocking predicate — unlike a placed NPC', () => {
    // The whole point: there is no standeeBlockedFor to feed into walkability.
    expect((mapStandees as Record<string, unknown>).standeeBlockedFor).toBeUndefined()
  })

  it('leaves its cell walkable when the map predicate is composed as MapScene does', () => {
    const scene = fakeScene([standee(1, 4, 4)])
    const standees = spawnStandees(scene)

    // MapScene composes walkability from the collision mask and the *NPC* live
    // list only — Standees are deliberately never part of it. Reproduce that
    // exactly (no standee ever handed in) and the cutout's cell stays walkable.
    const walkable = mapWalkable({ cols: 8, rows: 8 }, undefined, (x, y) => npcBlockedFor([])(x, y))

    expect(standees[0].tile).toEqual({ x: 4, y: 4 })
    expect(walkable(4, 4)).toBe(true)
  })
})

describe('standeeAt / placardOf', () => {
  const live = (id: number, x: number, y: number, extra = {}): LiveStandee => ({
    id,
    message: 'Jogging Sunday?',
    detail: null,
    ownerName: null,
    ownerAvatarUrl: null,
    replyLink: null,
    mine: false,
    tile: { x, y },
    sprite: fakeSprite(),
    ...extra,
  })

  it('finds the Standee standing on a cell, or nothing', () => {
    const standees = [live(1, 2, 3), live(2, 5, 6)]
    expect(standeeAt(standees, { x: 5, y: 6 })?.id).toBe(2)
    expect(standeeAt(standees, { x: 9, y: 9 })).toBeUndefined()
  })

  it('strips the Placard the shell renders from the live cutout, ownership included', () => {
    const s = live(7, 1, 1, {
      message: 'Board games at 4',
      detail: 'Kitchen, bring a game',
      ownerName: 'Ada Lovelace',
      ownerAvatarUrl: '/api/v1/users/abc/avatar',
      replyLink: 'https://basecamp.com/1/campfire/2',
      mine: true,
    })
    expect(placardOf(s)).toEqual({
      id: 7,
      message: 'Board games at 4',
      detail: 'Kitchen, bring a game',
      ownerName: 'Ada Lovelace',
      ownerAvatarUrl: '/api/v1/users/abc/avatar',
      replyLink: 'https://basecamp.com/1/campfire/2',
      // The affordance differs by who is asking (#370): the shell offers pick
      // up on your own cutout, reply on someone else's.
      mine: true,
    })
  })
})

// Live cutouts (#375): a Standee deployed while we stand here goes up mid-scene
// and a picked-up one comes down, no reload. The fold decides, the scene stamps
// — so this drives both together against the structural fake scene.
describe('mid-scene add and remove', () => {
  const note = (id: number, manifestId: number | null = null): StandeeNote => ({
    id,
    message: 'Board games at 4',
    detail: null,
    ownerName: 'Ada Lovelace',
    ownerAvatarUrl: null,
    replyLink: null,
    mine: false,
    tile: { x: 3, y: 5 },
    manifestId,
  })

  // The scene's peer-character cache (#266) is the rig source for a live
  // arrival: `{ charDir, scale }` once the owner's sheet is cut, absent before.
  const sceneWithPeers = (rigs: Array<[number, unknown]> = []) => {
    const scene: any = fakeScene([])
    scene.peerChars = new Map(rigs)
    return scene
  }
  const cutRig = { charDir: { down: { idleFrame: 'idleDown.0' } }, scale: 2 }

  it('stands a cutout up on the owner’s rig when their sheet is already cut', () => {
    const scene = sceneWithPeers([[7, cutRig]])

    const live = addStandee(scene, note(9, 7))

    expect(live.tile).toEqual({ x: 3, y: 5 })
    expect(live.sprite.type).toBe('sprite')
    expect(live.sprite.frameArg).toBe('idleDown.0')
    expect(live.sprite.scale).toBe(2)
    // Bottom-centre on its cell, exactly like a boot-path cutout.
    expect(live.sprite.pos).toEqual({ x: 3.5 * TILE, y: 6 * TILE })
  })

  it('falls back to the bundled still when the owner has no rig yet, then upgrades', () => {
    const scene = sceneWithPeers()
    const roster = [addStandee(scene, note(9, 7))]
    expect(roster[0].sprite.type).toBe('image')

    // Their sheet lands a moment later — the fallback is swapped for the rig.
    scene.peerChars.set(7, cutRig)
    restandeeRigs(scene, roster, 0)

    expect(roster[0].sprite.type).toBe('sprite')
    expect(roster[0].sprite.frameArg).toBe('idleDown.0')
    expect(peerSheetKey(7)).toBe('peer.sheet.7')
  })

  it('leaves an owner-less cutout on the fallback rather than churning sprites', () => {
    const scene = sceneWithPeers()
    const roster = [addStandee(scene, note(9, null))]
    const before = roster[0].sprite

    restandeeRigs(scene, roster, 0)

    expect(roster[0].sprite).toBe(before)
  })

  it('adds a deployed Standee and drops a picked-up one, fold and scene together', () => {
    const scene = sceneWithPeers([[7, cutRig]])
    const roster: LiveStandee[] = []
    const wire = { id: 9, x: 3, y: 5, message: 'Board games at 4', character_manifest_id: 7 }

    const added = applyStandeeFrame(roster, { type: 'standee:deploy', userId: 'peer-1', standee: wire }, 'own')
    if (added.action === 'add') roster.push(addStandee(scene, added.standee))

    expect(roster).toHaveLength(1)
    expect(standeeAt(roster, { x: 3, y: 5 })?.id).toBe(9)
    const sprite = roster[0].sprite

    const removed = applyStandeeFrame(roster, { type: 'standee:pickup', userId: 'peer-1', id: 9 }, 'own')
    if (removed.action === 'remove') removed.standee.sprite?.destroy()

    expect(roster).toEqual([])
    expect(sprite.destroyed).toBe(true)
  })
})

describe('sortStandees', () => {
  it('draws a Standee south of the avatar over it, one north behind, by the NPC rule', () => {
    const base = { detail: null, ownerName: null, ownerAvatarUrl: null, replyLink: null, mine: false }
    const north: LiveStandee = { id: 1, message: 'a', tile: { x: 0, y: 1 }, sprite: fakeSprite(), ...base }
    const south: LiveStandee = { id: 2, message: 'b', tile: { x: 0, y: 5 }, sprite: fakeSprite(), ...base }

    sortStandees([north, south], 3)

    expect(north.sprite.depth).toBeLessThan(MAP_PLAYER_DEPTH)
    expect(south.sprite.depth).toBeGreaterThan(MAP_PLAYER_DEPTH)
  })
})
