import { describe, expect, it } from 'vitest'
import { cameraBounds, encounterLayout } from './canvasLayout.ts'

describe('cameraBounds', () => {
  it('centres a world smaller than the viewport by widening the bounds', () => {
    // 9×7 map (432×336) inside the ~890×630 gb-screen: the clamp pins scroll to
    // the bounds origin, so a viewport-sized bounds box centred on the world
    // shows it with equal margins — at 1:1 pixels, the town's scale (#261).
    expect(cameraBounds(890, 630, 432, 336)).toEqual({ x: -229, y: -147, width: 890, height: 630 })
  })

  it('keeps a world at least viewport-sized on exact world bounds, like the town', () => {
    expect(cameraBounds(890, 630, 1440, 960)).toEqual({ x: 0, y: 0, width: 1440, height: 960 })
  })

  it('handles each axis independently', () => {
    expect(cameraBounds(890, 630, 1440, 336)).toEqual({ x: 0, y: -147, width: 1440, height: 630 })
  })
})

describe('encounterLayout', () => {
  it('reproduces the shipped stage sizes at the current gb-screen canvas', () => {
    const l = encounterLayout(890, 630)
    expect(l).toEqual({
      fieldH: 378,
      boxY: 378,
      boxH: 252,
      ruleH: 4,
      padX: 36,
      textY: 28,
      mainFont: 22,
      levelY: 63,
      levelFont: 18,
      btnW: { trainer: 200, wild: 140 },
      btnH: 60,
      btnFont: 20,
    })
  })

  it('scales with the canvas instead of assuming one size', () => {
    const one = encounterLayout(890, 630)
    const two = encounterLayout(1780, 1260)
    // Rounding may drift a doubled value by a pixel; proportionality is the claim.
    expect(Math.abs(two.mainFont - one.mainFont * 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(two.padX - one.padX * 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(two.btnH - one.btnH * 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(two.btnW.trainer - one.btnW.trainer * 2)).toBeLessThanOrEqual(1)
  })
})
