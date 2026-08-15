import { describe, it, expect } from 'vitest'
import sharp, { type OverlayOptions } from 'sharp'
import { composeLook } from '../src/kernel/composeLook.ts'
import layout from '../public/maps/characters/packs/modern-interiors/layout.json'

// The browser bake, pinned in node. composeLook is Phaser-free and only needs a
// canvas whose 2D context takes drawImage(img, 0, 0); we inject a sharp-backed
// stand-in that collects the overlays, so the exact code path the game runs is
// checked against the same golden #393 pinned — no DOM, no Phaser.
const PACK = 'public/maps/characters/packs/modern-interiors'
const LOOK = ['body-01', 'eyes-01', 'outfit-01-01', 'hairstyle-07-03', 'accessory-15-01']
const GOLDEN = 'test/fixtures/modern-interiors-look.png'

function sharpCanvas(width: number, height: number) {
  const overlays: { input: unknown; left: number; top: number }[] = []
  return {
    overlays,
    getContext: () => ({
      drawImage: (input: unknown, left: number, top: number) => overlays.push({ input, left, top }),
    }),
  }
}

const raw = (buf: string | Uint8Array) => sharp(buf).raw().toBuffer()

describe('composeLook', () => {
  it('stacks the parts onto the atlas so a Look frame matches the golden', async () => {
    const canvas = sharpCanvas(layout.atlas.width, layout.atlas.height)
    composeLook(
      LOOK.map((n) => `${PACK}/${n}.png`),
      layout,
      () => canvas,
    )
    // Raster the collected overlays into the full atlas, then slice the same
    // idleDown rect the packed layout names — commutes with the per-rect stack
    // #393's golden was baked from, so equal pixels prove the compose order.
    const atlas = await sharp({
      create: { width: layout.atlas.width, height: layout.atlas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(canvas.overlays as OverlayOptions[])
      .png()
      .toBuffer()
    const r = layout.postures.idleDown[0]
    const frame = await sharp(atlas).extract({ left: r.x, top: r.y, width: r.w, height: r.h }).png().toBuffer()
    expect((await raw(frame)).equals(await raw(GOLDEN))).toBe(true)
  })

  it('sizes the canvas to the atlas and draws every part at the origin, in order', () => {
    const canvas = sharpCanvas(0, 0)
    composeLook(['a.png', 'b.png'], layout, (w, h) => {
      expect([w, h]).toEqual([layout.atlas.width, layout.atlas.height])
      return canvas
    })
    expect(canvas.overlays).toEqual([
      { input: 'a.png', left: 0, top: 0 },
      { input: 'b.png', left: 0, top: 0 },
    ])
  })
})
