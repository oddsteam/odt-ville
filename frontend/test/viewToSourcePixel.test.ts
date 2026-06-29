import { describe, expect, it } from 'vitest'

import { viewToSourcePixel } from '../src/tileMapper/TileMapper.tsx'

// Maps a mouse position over the foreground view canvas to a source-image pixel.
// getBoundingClientRect() is the *border* box, so the mapping must shift past the
// border and scale by the *content* box — else paint lands offset (#51).
describe('viewToSourcePixel', () => {
  const rect = { left: 100, top: 50 }

  it('is 1:1 when the content box equals the source and there is no border', () => {
    const r = viewToSourcePixel(105, 57, rect, { left: 0, top: 0 }, { width: 64, height: 64 }, 64, 64)
    expect(r).toEqual({ x: 5, y: 7 })
  })

  it('scales a CSS-shrunk canvas back to source resolution', () => {
    // content is 128px wide displaying a 64px source → 2 view px per source px.
    const r = viewToSourcePixel(100 + 64, 50, rect, { left: 0, top: 0 }, { width: 128, height: 128 }, 64, 64)
    expect(r.x).toBe(32)
  })

  it('subtracts the border so the left drawing edge maps to pixel 0', () => {
    // 1px border: the surface starts 1px in from rect.left.
    const r = viewToSourcePixel(101, 51, rect, { left: 1, top: 1 }, { width: 64, height: 64 }, 64, 64)
    expect(r).toEqual({ x: 0, y: 0 })
  })

  it('clamps to the source bounds', () => {
    const lo = viewToSourcePixel(90, 40, rect, { left: 0, top: 0 }, { width: 64, height: 64 }, 64, 64)
    const hi = viewToSourcePixel(1000, 1000, rect, { left: 0, top: 0 }, { width: 64, height: 64 }, 64, 64)
    expect(lo).toEqual({ x: 0, y: 0 })
    expect(hi).toEqual({ x: 63, y: 63 })
  })
})
