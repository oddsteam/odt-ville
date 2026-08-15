import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import layout from '../public/maps/characters/packs/modern-interiors/layout.json'

// The 20 premade characters (#396) are trimmed by the same script against the
// same authored layout, so each ships as a 256×256 packed atlas that slices
// with the shared layout exactly like a composed Look does.
const PACK = 'public/maps/characters/packs/modern-interiors'
const PREMADES = Array.from({ length: 20 }, (_, i) => `premade-${String(i + 1).padStart(2, '0')}`)

describe('modern-interiors premade atlases', () => {
  it('emits all 20 premades at the packed atlas geometry', async () => {
    for (const name of PREMADES) {
      const meta = await sharp(`${PACK}/${name}.png`).metadata()
      expect([meta.width, meta.height]).toEqual([layout.atlas.width, layout.atlas.height])
    }
  })

  it('slices a premade to a non-empty idleDown frame', async () => {
    const { x, y, w, h } = layout.postures.idleDown[0]
    const px = await sharp(`${PACK}/premade-01.png`)
      .extract({ left: x, top: y, width: w, height: h })
      .raw()
      .toBuffer()
    // Some pixel in the frame is opaque — the atlas holds a real character, not
    // a blank crop. Alpha is every 4th byte in RGBA.
    let opaque = false
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] > 0) {
        opaque = true
        break
      }
    }
    expect(opaque).toBe(true)
  })
})
