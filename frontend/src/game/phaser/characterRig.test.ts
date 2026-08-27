// The Look bake (ADR-0017), structurally — no Phaser, no DOM. composeLook is
// stubbed to a sentinel (it owns a real canvas in the browser; here we only
// check the rig queues the atlases, composites on load-complete, and degrades a
// dangling Part to a skipped slot rather than a broken character.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../kernel/composeLook.ts', () => ({
  composeLook: vi.fn((images: any[]) => ({ sentinel: images.length })),
}))

import { preloadCharacter, queueCharacterSheet, peerSheetKey, applyPeerRig, CHAR_SHEET_KEY } from './characterRig.js'
import { composeLook } from '../../kernel/composeLook.ts'

function fakeScene(manifest: any, present: string[] = []) {
  const textures = new Set(present)
  const loaded: { key: string; url: string }[] = []
  const complete: (() => void)[] = []
  const added: { key: string; canvas: any }[] = []
  return {
    loaded,
    added,
    fireComplete: () => complete.forEach((cb) => cb()),
    registry: { get: (k: string) => (k === 'characterManifest' ? manifest : null) },
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
        textures.add(key) // Phaser registers a texture once the bytes arrive
        loaded.push({ key, url })
      },
      once: (evt: string, cb: () => void) => {
        if (evt === 'complete') complete.push(cb)
      },
    },
  }
}

const LOOK = {
  name: 'seed-look',
  parts: ['body-01', 'eyes-01'],
  layout: { name: 'modern-interiors', atlas: { width: 256, height: 256 }, postures: {} },
}

beforeEach(() => vi.clearAllMocks())

describe('preloadCharacter — Look', () => {
  it('queues one atlas per Part from the pack dir', () => {
    const scene = fakeScene(LOOK)
    preloadCharacter(scene)
    expect(scene.loaded).toEqual([
      { key: `${CHAR_SHEET_KEY}.part.body-01`, url: '/maps/characters/packs/modern-interiors/body-01.png' },
      { key: `${CHAR_SHEET_KEY}.part.eyes-01`, url: '/maps/characters/packs/modern-interiors/eyes-01.png' },
    ])
  })

  it('composites the loaded atlases into the shared sheet key on load-complete', () => {
    const scene = fakeScene(LOOK)
    preloadCharacter(scene)
    scene.fireComplete()
    expect(composeLook).toHaveBeenCalledOnce()
    expect(scene.added).toEqual([{ key: CHAR_SHEET_KEY, canvas: { sentinel: 2 } }])
  })

  it('degrades a dangling Part to a skipped slot, and warns so a dev sees it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // eyes-01 never loads (404 / not in pack): its texture stays absent.
    const scene = fakeScene(LOOK)
    scene.load.image = ((key: string, url: string) => {
      if (key.endsWith('body-01')) scene.textures.addCanvas(key, null) // only body arrives
      scene.loaded.push({ key, url })
    }) as any
    preloadCharacter(scene)
    scene.fireComplete()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('eyes-01'))
    expect(scene.added.at(-1)).toEqual({ key: CHAR_SHEET_KEY, canvas: { sentinel: 1 } })
    warn.mockRestore()
  })

  it('skips the whole bake when no Part loads, so the rig falls back to stills', () => {
    const scene = fakeScene(LOOK)
    scene.load.image = ((key: string, url: string) => scene.loaded.push({ key, url })) as any // nothing arrives
    preloadCharacter(scene)
    scene.fireComplete()
    expect(scene.added).toEqual([])
    expect(composeLook).not.toHaveBeenCalled()
  })
})

// The peer path (#397) resolves each peer's rig under its own peer.sheet.<id>
// key. It bakes a Look exactly like the player path — same shared decision — so
// a peer wearing a Look renders their character instead of the bundled stills.
describe('queueCharacterSheet — peer path bakes a Look under its own key', () => {
  it('queues the Look Parts under the peer sheet key and composites on load-complete', () => {
    const scene = fakeScene(null)
    const key = peerSheetKey(7)
    expect(queueCharacterSheet(scene, LOOK, key)).toBe(true)
    expect(scene.loaded).toEqual([
      { key: `${key}.part.body-01`, url: '/maps/characters/packs/modern-interiors/body-01.png' },
      { key: `${key}.part.eyes-01`, url: '/maps/characters/packs/modern-interiors/eyes-01.png' },
    ])
    scene.fireComplete()
    expect(scene.added).toEqual([{ key, canvas: { sentinel: 2 } }])
  })

  it('queues a plain sheet manifest under the peer sheet key', () => {
    const scene = fakeScene(null)
    const key = peerSheetKey(3)
    expect(queueCharacterSheet(scene, { sheet: { path: '/maps/characters/sheets/scout.png' } }, key)).toBe(true)
    expect(scene.loaded).toEqual([{ key, url: '/maps/characters/sheets/scout.png' }])
  })

  it('returns false for a manifest with neither a sheet nor Parts, so the peer keeps the stills', () => {
    const scene = fakeScene(null)
    expect(queueCharacterSheet(scene, { name: 'bare' }, peerSheetKey(9))).toBe(false)
    expect(scene.loaded).toEqual([])
  })
})

// A peer flashed the south idle pose for a frame on every step (#541):
// setTexture with no frame arg resets Phaser to the sheet's frame 0. applyPeerRig
// guards that so a peer already wearing its sheet keeps its walk frame.
describe('applyPeerRig — no south flash on a same-sheet step', () => {
  function fakeImg(startKey: string) {
    const img: any = {
      texture: { key: startKey },
      scale: 1,
      flip: false,
      played: [] as string[],
      frames: [] as string[],
      setTexture: vi.fn((k: string) => {
        img.texture = { key: k }
        return img
      }),
      setScale: vi.fn((s: number) => {
        img.scale = s
        return img
      }),
      setFlipX: vi.fn((f: boolean) => {
        img.flip = f
        return img
      }),
      setFrame: vi.fn((f: string) => {
        img.frames.push(f)
        return img
      }),
      anims: {
        play: vi.fn((k: string) => img.played.push(k)),
        stop: vi.fn(),
      },
    }
    return img
  }
  const rig = {
    scale: 2,
    charDir: {
      left: { walkAnimKey: 'peer.sheet.5.anim.walk-left', walkFrame: 'walk-left.0', walkFlip: false },
    },
  }

  it('does not reset the texture on a second step with the same sheet', () => {
    const key = peerSheetKey(5)
    const img = fakeImg('player.down.0')

    applyPeerRig(img, rig, key, 'left', true)
    expect(img.setTexture).toHaveBeenCalledWith(key) // first sighting mounts the sheet
    img.setTexture.mockClear()
    img.setFrame.mockClear()

    applyPeerRig(img, rig, key, 'left', true)
    expect(img.setTexture).not.toHaveBeenCalled() // no reset to frame 0 (south idle)
    expect(img.setFrame).not.toHaveBeenCalled() // walk anim keeps playing, frame untouched
  })

  it('switches texture when the peer manifest changes to a new sheet', () => {
    const img = fakeImg(peerSheetKey(5))
    applyPeerRig(img, rig, peerSheetKey(9), 'left', true)
    expect(img.setTexture).toHaveBeenCalledWith(peerSheetKey(9))
  })
})

describe('preloadCharacter — sheet manifest unchanged', () => {
  it('queues the single sheet image under the sheet key', () => {
    const scene = fakeScene({ name: 'scout', sheet: { path: '/maps/characters/sheets/scout.png' } })
    preloadCharacter(scene)
    expect(scene.loaded).toEqual([{ key: CHAR_SHEET_KEY, url: '/maps/characters/sheets/scout.png' }])
  })
})
