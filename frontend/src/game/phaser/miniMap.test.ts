import { describe, expect, it } from 'vitest'
import { miniMapLayout, miniMapDot } from './miniMap.ts'

describe('miniMapLayout', () => {
  it('scales the longest map side down to the max box side', () => {
    // 30×20 map: 30 tiles across the 120px box → 4px per tile.
    expect(miniMapLayout(30, 20)).toEqual({ width: 120, height: 80, cell: 4 })
  })

  it('keeps the map aspect when rows dominate', () => {
    expect(miniMapLayout(10, 40)).toEqual({ width: 30, height: 120, cell: 3 })
  })

  it('never lets a tiny map blow the box up past a readable cell', () => {
    // 4×3 map: 120/4 would be a 30px cell — cap it so the box stays small.
    const l = miniMapLayout(4, 3)
    expect(l.cell).toBeLessThanOrEqual(8)
    expect(l.width).toBe(l.cell * 4)
    expect(l.height).toBe(l.cell * 3)
  })
})

describe('miniMapDot', () => {
  it('centres the dot on its tile', () => {
    expect(miniMapDot({ x: 0, y: 0 }, 4)).toEqual({ x: 2, y: 2 })
    expect(miniMapDot({ x: 29, y: 19 }, 4)).toEqual({ x: 118, y: 78 })
  })
})
