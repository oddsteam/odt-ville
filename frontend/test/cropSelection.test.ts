import { describe, expect, it } from 'vitest'

import { cropSelection } from '../src/tileMapper/TileMapper.tsx'

// The mapper crops the atlas selection to a standalone PNG; cells the admin
// painted in erase mode get cleared to transparent so neighbour-sprite bleed
// inside the bounding box doesn't ship (#43). Fake ctx records the calls.
const fakeCtx = () => {
  const draws: unknown[][] = []
  const clears: unknown[][] = []
  return {
    imageSmoothingEnabled: true,
    drawImage: (...a: unknown[]) => draws.push(a),
    clearRect: (...a: unknown[]) => clears.push(a),
    draws,
    clears,
  }
}

describe('cropSelection', () => {
  const sel = { c: 2, r: 1, w: 3, h: 2 }

  it('draws the selected atlas region at native size', () => {
    const ctx = fakeCtx()
    cropSelection(ctx as never, 'img' as never, sel, 16, new Set())
    expect(ctx.draws).toEqual([['img', 32, 16, 48, 32, 0, 0, 48, 32]])
    expect(ctx.clears).toEqual([])
    expect(ctx.imageSmoothingEnabled).toBe(false)
  })

  it('clears each erased cell to transparent at its local rect', () => {
    const ctx = fakeCtx()
    cropSelection(ctx as never, 'img' as never, sel, 16, new Set(['0,0', '2,1']))
    expect(ctx.clears).toEqual([
      [0, 0, 16, 16],
      [32, 16, 16, 16],
    ])
  })

  it('ignores erased cells outside the selection bounds', () => {
    const ctx = fakeCtx()
    cropSelection(ctx as never, 'img' as never, sel, 16, new Set(['9,9']))
    expect(ctx.clears).toEqual([])
  })
})
