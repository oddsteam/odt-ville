import { describe, expect, it } from 'vitest'

import { floodSelect } from '../src/tileMapper/foreground.ts'

// 3×3 image: left column red, the rest green. Indices are y*width+x.
//   R G G
//   R G G
//   R G G
const W = 3
const H = 3
const px = (r: number, g: number, b: number) => [r, g, b, 255]
const RED = px(200, 0, 0)
const GREEN = px(0, 200, 0)
const data = new Uint8ClampedArray(
  [
    RED, GREEN, GREEN,
    RED, GREEN, GREEN,
    RED, GREEN, GREEN,
  ].flat(),
)

describe('floodSelect (magic wand)', () => {
  it('selects the contiguous same-colour region from the seed pixel', () => {
    const region = floodSelect(data, W, H, 0, 0, 10).sort((a, b) => a - b)
    expect(region).toEqual([0, 3, 6]) // the red column only
  })

  it('selects the larger region when seeded inside it', () => {
    const region = floodSelect(data, W, H, 2, 1, 10)
    expect(region.length).toBe(6) // the six green cells
    expect(region).not.toContain(0) // never crosses into the red column
  })

  it('tolerance widens the match to near-colours', () => {
    const speckled = new Uint8ClampedArray(data)
    speckled.set(px(208, 4, 2), 4 * (1 * W + 0)) // tweak the middle red pixel slightly
    expect(floodSelect(speckled, W, H, 0, 0, 0)).toEqual([0]) // strict: the tweaked pixel walls off the rest of the column
    expect(floodSelect(speckled, W, H, 0, 0, 20).sort((a, b) => a - b)).toEqual([0, 3, 6]) // tolerant: whole column again
  })
})
