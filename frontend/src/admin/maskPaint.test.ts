// Pins the collision-mask grid ops (#131): make/paint/erase/resize plus the
// empty check that keeps an unmasked map's document clean.

import { describe, expect, it } from 'vitest'
import { makeMask, setMaskCell, resizeMask, isMaskEmpty, blockedCells } from './maskPaint.ts'

describe('makeMask', () => {
  it('is a rows×cols grid with nothing masked', () => {
    const m = makeMask(3, 2)
    expect(m).toEqual([
      [false, false, false],
      [false, false, false],
    ])
    expect(isMaskEmpty(m)).toBe(true)
  })
})

describe('setMaskCell', () => {
  it('paints and erases a single cell without mutating the input', () => {
    const m = makeMask(2, 2)
    const painted = setMaskCell(m, 1, 0, true)
    expect(painted[0][1]).toBe(true)
    expect(m[0][1]).toBe(false) // original untouched
    expect(isMaskEmpty(painted)).toBe(false)

    const erased = setMaskCell(painted, 1, 0, false)
    expect(erased[0][1]).toBe(false)
    expect(isMaskEmpty(erased)).toBe(true)
  })

  it('is a no-op out of bounds', () => {
    const m = makeMask(2, 2)
    expect(setMaskCell(m, 5, 5, true)).toBe(m)
  })
})

describe('resizeMask', () => {
  it('keeps in-range blocked cells and clears the new area', () => {
    const m = setMaskCell(makeMask(2, 2), 0, 0, true)
    const bigger = resizeMask(m, 3, 3)
    expect(bigger[0][0]).toBe(true)
    expect(bigger[2][2]).toBe(false)
    expect(bigger.length).toBe(3)
    expect(bigger[0].length).toBe(3)

    // Shrinking drops the out-of-range cell.
    const smaller = resizeMask(m, 1, 1)
    expect(smaller).toEqual([[true]])
  })
})

describe('blockedCells', () => {
  it('lists every blocked cell in row-major order', () => {
    // The WYSIWYG overlay (#145) draws one red rectangle per blocked cell, so it
    // only needs the coordinates that are actually blocked — not the whole grid.
    let m = makeMask(3, 2)
    m = setMaskCell(m, 2, 0, true)
    m = setMaskCell(m, 0, 1, true)
    expect(blockedCells(m)).toEqual([
      { x: 2, y: 0 },
      { x: 0, y: 1 },
    ])
  })

  it('is empty when nothing is blocked', () => {
    expect(blockedCells(makeMask(2, 2))).toEqual([])
  })
})
