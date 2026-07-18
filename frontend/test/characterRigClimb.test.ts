import { describe, expect, it } from 'vitest'

import { normalizeManifest } from '../src/kernel/characterManifest.js'
import { buildCharacterRig, applyFacing } from '../src/game/phaser/characterRig.js'

// The rig compiles a climb anim per direction (#54/#55). When the manifest has
// climb frames it plays them; when it has none the climb slot falls back to the
// walk anim/frame, so a ladder never breaks a character that can't climb.

// Minimal fake of the Phaser scene surface buildCharacterRig touches.
function fakeScene() {
  const frames = new Set<string>()
  const anims = new Set<string>()
  return {
    textures: {
      exists: (k: string) => k === 'char.sheet',
      get: () => ({ has: (n: string) => frames.has(n), add: (n: string) => void frames.add(n) }),
    },
    anims: { exists: (k: string) => anims.has(k), create: ({ key }: { key: string }) => void anims.add(key) },
  }
}

const twoFrames = [{ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }]

describe('buildCharacterRig climb', () => {
  it('compiles a per-direction climb anim when climb frames are authored', () => {
    const m = normalizeManifest({ postures: { walkDown: twoFrames, climbDown: twoFrames } })
    const charDir = buildCharacterRig(fakeScene(), m).charDir as Record<string, any>
    expect(charDir.down.climbAnimKey).toBe('char.anim.climbDown')
    expect(charDir.down.climbFrame).toBe('climbDown.0')
    // Up shares the down climb animation (no separate climbUp slot).
    expect(charDir.up.climbAnimKey).toBe('char.anim.climbDown')
  })

  it('falls back to the walk anim when no climb frames exist', () => {
    const m = normalizeManifest({ postures: { walkDown: twoFrames } })
    const charDir = buildCharacterRig(fakeScene(), m).charDir as Record<string, any>
    expect(charDir.down.climbAnimKey).toBe('char.anim.walkDown')
    expect(charDir.down.climbFrame).toBe('walkDown.0')
  })
})

describe('applyFacing climbing', () => {
  function fakePlayer() {
    const plays: string[] = []
    return {
      plays,
      anims: { play: (k: string) => plays.push(k), stop: () => plays.push('stop') },
      setFlipX: () => {},
      setFrame: () => {},
    }
  }

  const charDir = {
    down: { walkAnimKey: 'char.anim.walkDown', walkFrame: 'walkDown.0', walkFlip: false, idleAnimKey: null, idleFrame: 'idleDown.0', idleFlip: false, climbAnimKey: 'char.anim.climbDown', climbFrame: 'climbDown.0', climbFlip: false },
  }

  it('plays the climb anim while walking on a ladder', () => {
    const p = fakePlayer()
    applyFacing(p, charDir, 'down', true, true)
    expect(p.plays).toEqual(['char.anim.climbDown'])
  })

  it('plays the walk anim while walking off a ladder', () => {
    const p = fakePlayer()
    applyFacing(p, charDir, 'down', true, false)
    expect(p.plays).toEqual(['char.anim.walkDown'])
  })

  it('ignores climbing while standing still (idle)', () => {
    const p = fakePlayer()
    applyFacing(p, charDir, 'down', false, true)
    expect(p.plays).toEqual(['stop']) // idleAnimKey null → stop + idle frame
  })
})
