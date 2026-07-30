// Pins the preview cursor→tile mapping (#143): a click on the WYSIWYG preview
// resolves to the tile under it, staying correct when the preview is scrolled
// (large map overflows its column) or CSS-scaled (shrunk to fit).

import { describe, expect, it } from 'vitest'
import { tileFromPointer, tileWithinGutter } from './previewPointer.ts'

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

  it('resolves a pointer left/above the canvas to a negative tile (#347)', () => {
    // 20px left of and 50px above the canvas: -20/48 → col -1, -50/48 → row -2.
    const rect = { left: 100, top: 100, width: 480, height: 480 }
    expect(tileFromPointer({ clientX: 80, clientY: 50 }, rect, canvas, tile)).toEqual({ x: -1, y: -2 })
  })
})

// Pins the gutter rule (#347): an out-of-map tile is kept while it lies within
// `gutter` tiles of the map, so a click there can name an off-map anchor; a
// gutter of 0 keeps the old drop-out-of-bounds behaviour.
describe('tileWithinGutter', () => {
  const bounds = { cols: 10, rows: 10 }

  it('keeps an in-map tile regardless of gutter', () => {
    expect(tileWithinGutter({ x: 0, y: 9 }, bounds, 0)).toEqual({ x: 0, y: 9 })
  })

  it('drops any out-of-map tile when the gutter is 0', () => {
    expect(tileWithinGutter({ x: -1, y: 5 }, bounds, 0)).toBeNull()
    expect(tileWithinGutter({ x: 5, y: 10 }, bounds, 0)).toBeNull()
  })

  it('keeps an out-of-map tile within the gutter, on any edge', () => {
    expect(tileWithinGutter({ x: -3, y: 5 }, bounds, 3)).toEqual({ x: -3, y: 5 })
    expect(tileWithinGutter({ x: 12, y: 12 }, bounds, 3)).toEqual({ x: 12, y: 12 })
  })

  it('drops a tile beyond the gutter', () => {
    expect(tileWithinGutter({ x: -4, y: 5 }, bounds, 3)).toBeNull()
    expect(tileWithinGutter({ x: 5, y: 13 }, bounds, 3)).toBeNull()
  })
})
