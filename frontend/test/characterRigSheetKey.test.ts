import { describe, expect, it } from 'vitest'

import { normalizeManifest } from '../src/kernel/characterManifest.js'
import { buildCharacterRig } from '../src/game/phaser/characterRig.js'

// The rig is keyed by sheet (#267): peers each animate from their own loaded
// texture, so frames and anim keys must be scoped per sheet key rather than to
// the local player's single global sheet.

function fakeScene() {
  const frames = new Map<string, Set<string>>()
  const anims = new Set<string>()
  const created: Array<{ key: string; frames: Array<{ key: string; frame: string }> }> = []
  return {
    created,
    frames,
    textures: {
      exists: (k: string) => frames.has(k),
      get: (k: string) => ({
        has: (n: string) => frames.get(k)!.has(n),
        add: (n: string) => void frames.get(k)!.add(n),
      }),
    },
    anims: {
      exists: (k: string) => anims.has(k),
      create: (cfg: { key: string; frames: Array<{ key: string; frame: string }> }) => {
        anims.add(cfg.key)
        created.push(cfg)
      },
    },
  }
}

const twoFrames = [{ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }]

describe('buildCharacterRig per sheet key', () => {
  it('builds each sheet its own frames and anims', () => {
    const scene = fakeScene()
    scene.frames.set('peer.sheet.1', new Set())
    scene.frames.set('peer.sheet.2', new Set())
    const m = normalizeManifest({ postures: { walkDown: twoFrames } })

    const one = buildCharacterRig(scene, m, 'peer.sheet.1').charDir as Record<string, any>
    const two = buildCharacterRig(scene, m, 'peer.sheet.2').charDir as Record<string, any>

    expect(one.down.walkAnimKey).not.toBe(two.down.walkAnimKey)
    expect(scene.frames.get('peer.sheet.1')!.has('walkDown.0')).toBe(true)
    expect(scene.frames.get('peer.sheet.2')!.has('walkDown.0')).toBe(true)
    // Each anim draws from its own texture, not the local player's sheet.
    for (const cfg of scene.created) {
      expect(cfg.frames.every((f) => `${f.key}.anim.walkDown` === cfg.key)).toBe(true)
    }
  })

  it('reports no manifest when that sheet key never loaded', () => {
    const scene = fakeScene()
    const m = normalizeManifest({ postures: { walkDown: twoFrames } })
    expect(buildCharacterRig(scene, m, 'peer.sheet.missing').usingManifest).toBe(false)
  })
})
