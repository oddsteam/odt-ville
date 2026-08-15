// The DOM surfaces that paint a tile object's art (#437): once `image` can be a
// frame strip (#435), an <img> smears 72 frames across a 32px slot. These styles
// show frame 0 and walk the rest with a steps() animation; a still object keeps
// painting the whole image exactly as before.

import { describe, expect, it } from 'vitest'
import { frameArtStyle } from './frameArt.ts'

// The worst case: 72 frames of a 1×2 (32×64px) footprint — 2304px of strip.
const SPELL_BOOK = { image: 'data:image/png;base64,book', frame_count: 72, fps: null, footprint_w: 1, footprint_h: 2 }
const STILL = { image: 'data:image/png;base64,oak', frame_count: 1, fps: null, footprint_w: 1, footprint_h: 1 }

describe('frameArtStyle', () => {
  it('paints a still object whole — letterboxed in a palette slot', () => {
    expect(frameArtStyle(STILL, 'contain')).toMatchObject({
      backgroundImage: 'url("data:image/png;base64,oak")',
      backgroundSize: 'contain',
      backgroundPosition: 'center',
    })
    expect(frameArtStyle(STILL, 'contain').animation).toBeUndefined()
  })

  it('paints a still object stretched over a footprint rect (today’s ghost)', () => {
    expect(frameArtStyle(STILL, 'stretch')).toMatchObject({ backgroundSize: '100% 100%' })
  })

  it('shrinks the palette box to the frame’s shape so one frame fills it exactly', () => {
    expect(frameArtStyle(SPELL_BOOK, 'contain')).toMatchObject({
      backgroundImage: 'url("data:image/png;base64,book")',
      // A tall 1×2 frame letterboxes to half the 32px slot's width — never
      // clipped, and one frame still spans the box, which the steps() walk needs.
      width: '16px',
      height: '32px',
      backgroundSize: '7200% 100%',
      backgroundPosition: '0 0',
    })
  })

  it('letterboxes a wide frame the other way', () => {
    expect(frameArtStyle({ ...SPELL_BOOK, footprint_w: 2, footprint_h: 1 }, 'contain')).toMatchObject({
      width: '32px',
      height: '16px',
    })
  })

  it('assumes a square frame when no footprint rides along', () => {
    expect(frameArtStyle({ image: 'x', frame_count: 4 }, 'contain')).toMatchObject({
      width: '32px',
      height: '32px',
    })
  })

  it('stretches a strip frame over a footprint rect', () => {
    expect(frameArtStyle(SPELL_BOOK, 'stretch')).toMatchObject({ backgroundSize: '7200% 100%' })
  })

  it('walks every frame once per loop, at the default rate when none is authored', () => {
    expect(frameArtStyle(SPELL_BOOK, 'contain').animation).toBe('frame-strip 6s steps(72, jump-none) infinite')
  })

  it('plays at the authored fps', () => {
    expect(frameArtStyle({ ...SPELL_BOOK, fps: 24 }, 'contain').animation).toBe(
      'frame-strip 3s steps(72, jump-none) infinite',
    )
  })

  it('treats a missing frame_count as still art', () => {
    expect(frameArtStyle({ image: 'x' }, 'contain')).toMatchObject({ backgroundSize: 'contain' })
  })
})
