import { describe, expect, it } from 'vitest'

import { cellAtPoint, visibleSlice } from '../src/lib/tilesetWindow.ts'

// #352: the mapper canvases only cover their container, so both the draw and
// the hit-test have to account for the scroll offset into the sheet.
describe('visibleSlice', () => {
  it('maps the scrolled window back to whole source pixels', () => {
    // 3× zoom, scrolled 300px down → 100 source px down; a 600×450 viewport
    // covers 200×150 source px (+1 for the partial cell at the far edge).
    expect(visibleSlice({ x: 0, y: 300, w: 600, h: 450 }, 3, 1024, 8288)).toEqual({
      sx: 0, sy: 100, sw: 201, sh: 151,
    })
  })

  it('snaps a fractional scroll down to the source pixel that covers it', () => {
    expect(visibleSlice({ x: 0, y: 305, w: 300, h: 300 }, 3, 1024, 8288).sy).toBe(101)
  })

  it('clamps the slice to the sheet at the bottom edge', () => {
    expect(visibleSlice({ x: 0, y: 24_800, w: 600, h: 450 }, 3, 1024, 8288)).toEqual({
      sx: 0, sy: 8266, sw: 201, sh: 22,
    })
  })
})

describe('cellAtPoint', () => {
  it('adds the scroll offset back before picking the cell', () => {
    // step 96 (32px cell at 3×); a click 10px into a window scrolled 960px down
    // is row 10, not row 0.
    expect(cellAtPoint(10, 10, { x: 0, y: 960 }, 96, 32, 259)).toEqual({ c: 0, r: 10 })
  })

  it('clamps to the grid', () => {
    expect(cellAtPoint(-40, 999_999, { x: 0, y: 0 }, 96, 32, 259)).toEqual({ c: 0, r: 258 })
  })
})
