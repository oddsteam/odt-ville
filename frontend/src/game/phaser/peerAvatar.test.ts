// Faces on the nameplate (#323). The texture side is the whole risk: ask our
// own avatar path once per subject, hand back a round chip rather than the
// square source, re-attach a face already in the cache on a rejoin, and settle
// to nothing when the person has no avatar. Structural fake scene, the same way
// the placed-NPC test does — no Phaser.

import { describe, expect, it } from 'vitest'
import { loadAvatar } from './peerAvatar.ts'

function fakeCanvas() {
  const ops: string[] = []
  return {
    ops,
    refreshed: 0,
    context: {
      lineWidth: 0,
      strokeStyle: '',
      save: () => void ops.push('save'),
      restore: () => void ops.push('restore'),
      beginPath: () => void ops.push('beginPath'),
      arc: () => void ops.push('arc'),
      clip: () => void ops.push('clip'),
      drawImage: () => void ops.push('drawImage'),
      stroke: () => void ops.push('stroke'),
    },
    refresh() {
      this.refreshed++
    },
  }
}

function fakeScene(cached: string[] = []) {
  const textures = new Set(cached)
  const queued: Array<{ key: string; url: string }> = []
  const canvases = new Map<string, ReturnType<typeof fakeCanvas>>()
  const drains: Array<() => void> = []
  return {
    queued,
    canvases,
    textures: {
      exists: (k: string) => textures.has(k),
      get: () => ({ getSourceImage: () => ({}) }),
      createCanvas: (key: string, width: number, height: number) => {
        textures.add(key)
        const canvas = Object.assign(fakeCanvas(), { width, height })
        canvases.set(key, canvas)
        return canvas
      },
    },
    load: {
      image: (key: string, url: string) => void queued.push({ key, url }),
      once: (_event: string, fn: () => void) => void drains.push(fn),
      start: () => {},
    },
    // Drain the loader; `arrived` names the keys whose bytes actually landed.
    settle: (...arrived: string[]) => {
      arrived.forEach((k) => textures.add(k))
      drains.splice(0).forEach((fn) => fn())
    },
  }
}

describe('loadAvatar', () => {
  it('fetches a face from our own path, keyed by the presence subject', () => {
    const scene = fakeScene()
    const got: string[] = []
    loadAvatar(scene, 'kc-1', new Set(), (key) => got.push(key))

    expect(scene.queued).toEqual([{ key: 'peer.avatar.kc-1', url: '/api/v1/users/kc-1/avatar' }])
    expect(got).toEqual([])
    scene.settle('peer.avatar.kc-1')
    expect(got).toEqual(['peer.avatar.kc-1.round'])
  })

  it('hands back a round chip, the square source clipped into it', () => {
    const scene = fakeScene()
    loadAvatar(scene, 'kc-1', new Set(), () => {})
    scene.settle('peer.avatar.kc-1')

    const chip = scene.canvases.get('peer.avatar.kc-1.round')!
    // Clipped *before* the draw, or the corners survive and it's a square again.
    expect(chip.ops.indexOf('clip')).toBeLessThan(chip.ops.indexOf('drawImage'))
    expect(chip.ops).toContain('stroke')
    expect(chip.refreshed).toBe(1)
  })

  it('leaves the plain nameplate when the person has no avatar', () => {
    const scene = fakeScene()
    const got: string[] = []
    loadAvatar(scene, 'kc-1', new Set(), (key) => got.push(key))

    // The endpoint 404s (no avatar, unknown user, dead upstream) — the queue
    // still drains, but no texture landed.
    scene.settle()
    expect(got).toEqual([])
    expect(scene.canvases.size).toBe(0)
  })

  it('asks once per subject while the first fetch is in flight', () => {
    const scene = fakeScene()
    const asked = new Set<string>()
    loadAvatar(scene, 'kc-1', asked, () => {})
    loadAvatar(scene, 'kc-1', asked, () => {})

    expect(scene.queued).toHaveLength(1)
  })

  it('re-attaches a cached chip without a second fetch or a second cut', () => {
    const scene = fakeScene(['peer.avatar.kc-1', 'peer.avatar.kc-1.round'])
    const got: string[] = []
    loadAvatar(scene, 'kc-1', new Set(['kc-1']), (key) => got.push(key))

    expect(got).toEqual(['peer.avatar.kc-1.round'])
    expect(scene.queued).toEqual([])
    expect(scene.canvases.size).toBe(0)
  })
})
