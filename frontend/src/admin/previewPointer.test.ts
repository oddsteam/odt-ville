// Pins the preview cursor→tile mapping (#143): a click on the WYSIWYG preview
// resolves to the tile under it, staying correct when the preview is scrolled
// (large map overflows its column) or CSS-scaled (shrunk to fit).

import { describe, expect, it } from 'vitest'
import { tileFromPointer } from './previewPointer.ts'

// A 10×10 tile preview at 48px/tile → a 480×480 native canvas.
const canvas = { width: 480, height: 480 }
const tile = 48

describe('tileFromPointer', () => {
  it('maps a click to the tile under it, unscrolled and unscaled', () => {
    const rect = { left: 0, top: 0, width: 480, height: 480 }
    // 100px in is col 2 (96..143), 200px down is row 4 (192..239).
    expect(tileFromPointer({ clientX: 100, clientY: 200 }, rect, canvas, tile)).toEqual({ x: 2, y: 4 })
  })

  it('accounts for scroll — the rect origin shifts negative as the canvas scrolls', () => {
    // Scrolled two tiles right, one tile down: the canvas top-left sits off-screen.
    const rect = { left: -96, top: -48, width: 480, height: 480 }
    // A click at the column's visible top-left (0,0) is really tile (2,1).
    expect(tileFromPointer({ clientX: 0, clientY: 0 }, rect, canvas, tile)).toEqual({ x: 2, y: 1 })
  })

  it('accounts for CSS scale — displayed size differs from native pixels', () => {
    // Shrunk to half: 480 native px shown across 240 css px (scale 2×).
    const rect = { left: 0, top: 0, width: 240, height: 240 }
    // 60css px in → 120 native px → col 2; 24css px down → 48 native px → row 1.
    expect(tileFromPointer({ clientX: 60, clientY: 24 }, rect, canvas, tile)).toEqual({ x: 2, y: 1 })
  })
})
