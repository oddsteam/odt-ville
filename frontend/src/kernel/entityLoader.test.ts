// Animated catalog art (#435, ADR-0019). An animated object is a saved tile
// object carrying `frame_count > 1`, its `image` a horizontal frame strip: the
// loader registers it as a spritesheet whose frame size is derived from the
// image (never from the float footprint), and the stamp becomes a looping
// sprite. A still object (`frame_count` 1 or absent) must take the pre-#435
// path unchanged — same key, same call, no sprite.

import { describe, expect, it } from 'vitest'
import { TILE } from './constants.ts'
import {
  loadObjectTextures,
  objectAnimKey,
  objectTextureKey,
  stampEntity,
  type EntityObject,
} from './entityLoader.ts'

// A PNG data URL declaring w×h in its IHDR header — the only bytes the frame
// size is read from, so no pixel data is needed.
const png = (w: number, h: number) => {
  const be = (n: number) =>
    String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
  return `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\n' + be(13) + 'IHDR' + be(w) + be(h))}`
}

// The spell book from the art pack: 2304×64 = 72 frames of 1×2 tiles.
const SPELL_BOOK: EntityObject = {
  id: 7,
  image: png(2304, 64),
  footprint_w: 1,
  footprint_h: 2,
  frame_count: 72,
  fps: 12,
  playback: 'loop',
}

const STILL: EntityObject = { id: 3, image: png(32, 32), footprint_w: 1, footprint_h: 1 }

// Enough Phaser to record what the loader and the stamp asked for. Loading a
// texture registers its key, the way the real preload→create handoff does.
function fakeScene() {
  const loaded = { image: [] as any[][], spritesheet: [] as any[][] }
  const keys = new Set<string>()
  const animsCreated: any[] = []
  const register = (a: any[]) => keys.add(a[0])
  const gameObject = (type: string, args: any[]) => {
    const o: any = { type, args, played: [] as string[] }
    o.setOrigin = () => o
    o.setDepth = () => o
    o.setDisplaySize = (w: number, h: number) => ((o.size = [w, h]), o)
    o.play = (k: string) => (o.played.push(k), o)
    return o
  }
  return {
    load: {
      image: (...a: any[]) => (loaded.image.push(a), register(a)),
      spritesheet: (...a: any[]) => (loaded.spritesheet.push(a), register(a)),
    },
    textures: { exists: (k: string) => keys.has(k) },
    anims: {
      exists: (k: string) => animsCreated.some((c) => c.key === k),
      create: (cfg: any) => animsCreated.push(cfg),
    },
    add: {
      image: (...a: any[]) => gameObject('image', a),
      sprite: (...a: any[]) => gameObject('sprite', a),
    },
    loaded,
    animsCreated,
  }
}

const draw = (id: number, o: EntityObject) => ({
  key: objectTextureKey(id),
  x: 2,
  y: 3,
  w: o.footprint_w,
  h: o.footprint_h,
  depth: 1,
})

describe('loadObjectTextures', () => {
  it('registers a frame strip as a spritesheet sized from the image, not the footprint', () => {
    const scene = fakeScene()
    loadObjectTextures(scene, [SPELL_BOOK])

    expect(scene.loaded.image).toEqual([])
    expect(scene.loaded.spritesheet).toEqual([
      [objectTextureKey(7), SPELL_BOOK.image, { frameWidth: 32, frameHeight: 64 }],
    ])
  })

  it('registers a still object exactly as before — one image, same key', () => {
    const scene = fakeScene()
    loadObjectTextures(scene, [STILL, { ...STILL, id: 4, frame_count: 1 }])

    expect(scene.loaded.spritesheet).toEqual([])
    expect(scene.loaded.image).toEqual([
      [objectTextureKey(3), STILL.image],
      [objectTextureKey(4), STILL.image],
    ])
  })

  it('falls back to a still image when the art carries no readable PNG size', () => {
    const scene = fakeScene()
    loadObjectTextures(scene, [{ ...SPELL_BOOK, image: 'data:image/gif;base64,R0lGOD' }])

    expect(scene.loaded.spritesheet).toEqual([])
    expect(scene.loaded.image.length).toBe(1)
  })
})

describe('stampEntity', () => {
  it('stamps an animated object as a looping sprite at its footprint', () => {
    const scene = fakeScene()
    loadObjectTextures(scene, [SPELL_BOOK])
    const sprite = stampEntity(scene, draw(7, SPELL_BOOK))

    expect(sprite.type).toBe('sprite')
    expect(sprite.played).toEqual([objectAnimKey(7)])
    expect(sprite.size).toEqual([TILE, 2 * TILE])
    expect(scene.animsCreated).toMatchObject([
      { key: objectAnimKey(7), frameRate: 12, repeat: -1 },
    ])
    expect(scene.animsCreated[0].frames.length).toBe(72)
  })

  it('registers one anim per object id, so two placements share it', () => {
    const scene = fakeScene()
    loadObjectTextures(scene, [SPELL_BOOK])
    stampEntity(scene, draw(7, SPELL_BOOK))
    stampEntity(scene, { ...draw(7, SPELL_BOOK), x: 9 })

    expect(scene.animsCreated.length).toBe(1)
  })

  it('stamps a still object as an image, as before', () => {
    const scene = fakeScene()
    loadObjectTextures(scene, [STILL])
    const img = stampEntity(scene, draw(3, STILL))

    expect(img.type).toBe('image')
    expect(scene.animsCreated).toEqual([])
  })

  it('draws nothing for a never-loaded texture (ADR-0008)', () => {
    const scene = fakeScene()
    expect(stampEntity(scene, draw(7, SPELL_BOOK))).toBeNull()
  })
})
