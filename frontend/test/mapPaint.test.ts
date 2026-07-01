import { describe, expect, it } from 'vitest'

import { makeTerrain, paintCell, paintRect, resizeTerrain } from '../src/admin/mapPaint.ts'

describe('makeTerrain', () => {
  it('builds a rows×cols grid filled with one terrain', () => {
    expect(makeTerrain(3, 2, 'grass')).toEqual([
      ['grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass'],
    ])
  })
})

describe('paintCell', () => {
  it('sets one cell and leaves the rest, without mutating the input', () => {
    const before = makeTerrain(2, 2, 'grass')
    const after = paintCell(before, 1, 0, 'dirt')
    expect(after[0][1]).toBe('dirt')
    expect(after[0][0]).toBe('grass')
    expect(before[0][1]).toBe('grass') // input untouched
  })

  it('ignores out-of-bounds coordinates', () => {
    const before = makeTerrain(2, 2, 'grass')
    expect(paintCell(before, 5, 5, 'dirt')).toEqual(before)
  })
})

describe('paintRect', () => {
  it('fills the inclusive rectangle between two corners, any drag direction', () => {
    const after = paintRect(makeTerrain(3, 3, 'grass'), 2, 2, 0, 1, 'dirt')
    expect(after).toEqual([
      ['grass', 'grass', 'grass'],
      ['dirt', 'dirt', 'dirt'],
      ['dirt', 'dirt', 'dirt'],
    ])
  })

  it('clamps the rectangle to the grid bounds', () => {
    const after = paintRect(makeTerrain(2, 2, 'grass'), 0, 0, 9, 9, 'road')
    expect(after).toEqual([
      ['road', 'road'],
      ['road', 'road'],
    ])
  })
})

describe('resizeTerrain', () => {
  it('grows the grid, keeping painted cells and filling the new ones', () => {
    const before = [
      ['dirt', 'grass'],
      ['grass', 'grass'],
    ]
    expect(resizeTerrain(before, 3, 2, 'grass')).toEqual([
      ['dirt', 'grass', 'grass'],
      ['grass', 'grass', 'grass'],
    ])
  })

  it('shrinks the grid, dropping the cells outside the new bounds', () => {
    const before = [
      ['dirt', 'grass', 'road'],
      ['grass', 'grass', 'grass'],
    ]
    expect(resizeTerrain(before, 2, 1, 'grass')).toEqual([['dirt', 'grass']])
  })
})
