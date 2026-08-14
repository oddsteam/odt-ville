import { describe, it, expect } from 'vitest'
import { packLayout } from '../scripts/trim-pack.mjs'
import authored from '../public/maps/characters/packs/modern-interiors/authored-layout.json'

describe('packLayout', () => {
  it('dedups the authored rects into a compact 256×256 atlas', () => {
    const { packed, slots } = packLayout(authored)
    expect(slots).toHaveLength(28) // 4 idles + 4×6 walks, all distinct
    expect(packed.atlas).toEqual({ width: 256, height: 256 })
  })

  it('keeps every posture key and lands every frame inside the atlas', () => {
    const { packed } = packLayout(authored)
    expect(Object.keys(packed.postures)).toEqual(Object.keys(authored.postures))
    for (const frames of Object.values<any>(packed.postures)) {
      for (const r of frames) {
        expect(r.x + r.w).toBeLessThanOrEqual(256)
        expect(r.y + r.h).toBeLessThanOrEqual(256)
      }
    }
  })

  it('points identical source rects at one shared slot (mixability)', () => {
    const dup = {
      ...authored,
      postures: { a: [{ x: 0, y: 0, w: 32, h: 64 }], b: [{ x: 0, y: 0, w: 32, h: 64 }] },
    }
    const { packed, slots } = packLayout(dup)
    expect(slots).toHaveLength(1)
    expect(packed.postures.a[0]).toEqual(packed.postures.b[0])
  })

  it('is deterministic — same input, byte-identical output', () => {
    expect(JSON.stringify(packLayout(authored))).toEqual(JSON.stringify(packLayout(authored)))
  })
})
