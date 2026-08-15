// queueRigSheet is the one sheet-or-Look loader shared by every rig consumer
// (ADR-0017): the player/peer path (characterRig) and the placed NPCs +
// Standees (mapRenderer). One decision, so a Look bakes the same everywhere and
// a standee can't quietly fall back to the bundled stills while the player
// wears the recipe. composeLook is stubbed — the browser owns the real canvas.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./composeLook.ts', () => ({
  composeLook: vi.fn((images: any[]) => ({ sentinel: images.length })),
}))

import { queueRigSheet } from './rigSheet.js'
import { composeLook } from './composeLook.ts'

function fakeScene(present: string[] = []) {
  const textures = new Set(present)
  const loaded: { key: string; url: string }[] = []
  const complete: (() => void)[] = []
  const added: { key: string; canvas: any }[] = []
  return {
    loaded,
    added,
    fireComplete: () => complete.forEach((cb) => cb()),
    textures: {
      exists: (k: string) => textures.has(k),
      get: (k: string) => ({ getSourceImage: () => `img:${k}` }),
      addCanvas: (k: string, canvas: any) => {
        textures.add(k)
        added.push({ key: k, canvas })
      },
    },
    load: {
      image: (key: string, url: string) => {
        textures.add(key)
        loaded.push({ key, url })
      },
      once: (evt: string, cb: () => void) => {
        if (evt === 'complete') complete.push(cb)
      },
    },
  }
}

const LOOK = {
  parts: ['body-01', 'eyes-01'],
  layout: { name: 'modern-interiors', atlas: { width: 256, height: 256 } },
}

beforeEach(() => vi.clearAllMocks())

describe('queueRigSheet', () => {
  it('bakes a Look under the given key: queues its Parts and composites on complete', () => {
    const scene = fakeScene()
    expect(queueRigSheet(scene, LOOK, 'standee.5')).toBe(true)
    expect(scene.loaded).toEqual([
      { key: 'standee.5.part.body-01', url: '/maps/characters/packs/modern-interiors/body-01.png' },
      { key: 'standee.5.part.eyes-01', url: '/maps/characters/packs/modern-interiors/eyes-01.png' },
    ])
    scene.fireComplete()
    expect(composeLook).toHaveBeenCalledOnce()
    expect(scene.added).toEqual([{ key: 'standee.5', canvas: { sentinel: 2 } }])
  })

  it('queues a plain sheet manifest under the given key', () => {
    const scene = fakeScene()
    expect(queueRigSheet(scene, { sheet: { path: '/x.png' } }, 'npc.3')).toBe(true)
    expect(scene.loaded).toEqual([{ key: 'npc.3', url: '/x.png' }])
  })

  it('returns false for a manifest with neither a sheet nor Parts', () => {
    const scene = fakeScene()
    expect(queueRigSheet(scene, { name: 'bare' }, 'npc.9')).toBe(false)
    expect(scene.loaded).toEqual([])
  })
})
