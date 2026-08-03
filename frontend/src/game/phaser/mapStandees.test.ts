// Standees as live runtime cutouts (#369, ADR-0015): each placed Standee gets a
// static idle-down cutout from the owner's rig, a dangling owner falls back to
// the bundled still, cutouts sort against the avatar's row — and, load-bearing,
// a cutout never reaches a walkability predicate. Structural fake scene, no
// Phaser, the same shape the placed-NPC spawn test uses.

import { describe, expect, it } from 'vitest'
import { spawnStandees, sortStandees, type LiveStandee } from './mapStandees.ts'
import * as mapStandees from './mapStandees.ts'
import { npcBlockedFor } from './mapNpcs.ts'
import { mapWalkable, MAP_PLAYER_DEPTH } from './mapWalk.ts'
import { standeeSheetKey } from '../../kernel/mapRenderer.ts'
import { normalizeManifest } from '../../kernel/characterManifest.js'

const frame = (x: number) => ({ x, y: 0, w: 32, h: 64 })

function fakeSprite() {
  const s: any = { type: 'sprite', frameArg: null, depth: 0, scale: 1, flipX: false, origin: null, played: [] }
  s.anims = { play: (k: string) => s.played.push(k) }
  s.setOrigin = (x: number, y: number) => ((s.origin = { x, y }), s)
  s.setScale = (v: number) => ((s.scale = v), s)
  s.setFlipX = (v: boolean) => ((s.flipX = v), s)
  s.setDepth = (d: number) => ((s.depth = d), s)
  return s
}

function fakeImage() {
  const s: any = { type: 'image', depth: 0, size: null, origin: null }
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
      sprite: (x: number, y: number, _k: string, f: string) => {
        const s = fakeSprite()
        s.frameArg = f
        s.pos = { x, y }
        created.push(s)
        return s
      },
      image: (x: number, y: number) => {
        const s = fakeImage()
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

describe('sortStandees', () => {
  it('draws a Standee south of the avatar over it, one north behind, by the NPC rule', () => {
    const north: LiveStandee = { id: 1, message: 'a', tile: { x: 0, y: 1 }, sprite: fakeSprite() }
    const south: LiveStandee = { id: 2, message: 'b', tile: { x: 0, y: 5 }, sprite: fakeSprite() }

    sortStandees([north, south], 3)

    expect(north.sprite.depth).toBeLessThan(MAP_PLAYER_DEPTH)
    expect(south.sprite.depth).toBeGreaterThan(MAP_PLAYER_DEPTH)
  })
})
