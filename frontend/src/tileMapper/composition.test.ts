import { describe, expect, it } from 'vitest'

import { bounds, erase, flatten, overlaps, repeat, type Placed } from './composition.ts'

const WALLS = 'buildings/5_Floor_Modular_Buildings_32x32'
const PROPS = 'props/3_City_Props_32x32'
const BLOCK = { c: 4, r: 0, w: 2, h: 1, sheet: WALLS } // a 2-wide strip at source cells (4,0)-(5,0)
const at = (c: number, r: number) => ({ c, r })
const keys = (p: Placed) => [...p.keys()].sort()

describe('repeat', () => {
  it('stamps the block once when the drag never leaves the anchor cell', () => {
    const p = repeat(new Map(), BLOCK, at(0, 0), at(0, 0))
    expect(keys(p)).toEqual(['0,0', '1,0'])
    expect(p.get('0,0')).toEqual([4, 0, WALLS])
    expect(p.get('1,0')).toEqual([5, 0, WALLS])
  })

  it('repeats the block along the drag, stepping by the block size', () => {
    const p = repeat(new Map(), BLOCK, at(0, 0), at(5, 0))
    expect(keys(p)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0'])
    expect(p.get('4,0')).toEqual([4, 0, WALLS]) // the third copy starts the block again
  })

  it('repeats away from the anchor when the drag goes up, so a tower stays aligned', () => {
    const floor = { c: 0, r: 2, w: 1, h: 2, sheet: WALLS }
    const p = repeat(new Map(), floor, at(0, 8), at(0, 5))
    expect(keys(p)).toEqual(['0,6', '0,7', '0,8', '0,9'])
    expect(p.get('0,8')).toEqual([0, 2, WALLS]) // the anchor cell keeps the block's top row
  })

  it('replaces what is already in a cell instead of stacking', () => {
    const first = repeat(new Map(), { c: 0, r: 0, w: 1, h: 1, sheet: WALLS }, at(3, 3), at(3, 3))
    const second = repeat(first, { c: 9, r: 9, w: 1, h: 1, sheet: WALLS }, at(3, 3), at(3, 3))
    expect(second.get('3,3')).toEqual([9, 9, WALLS])
    expect(second.size).toBe(1)
  })
})

describe('erase', () => {
  it('clears every cell in the dragged rectangle and leaves the rest', () => {
    const p = repeat(new Map(), { c: 0, r: 0, w: 4, h: 2, sheet: WALLS }, at(0, 0), at(0, 0))
    expect(keys(erase(p, at(1, 1), at(2, 0)))).toEqual(['0,0', '0,1', '3,0', '3,1'])
  })
})

describe('bounds', () => {
  it('is null while nothing is placed', () => {
    expect(bounds([new Map()])).toBeNull()
  })

  it('is the inclusive bounding box of the placed cells', () => {
    const p = erase(repeat(new Map(), { c: 0, r: 0, w: 3, h: 3, sheet: WALLS }, at(2, 5), at(2, 5)), at(2, 5), at(2, 5))
    expect(bounds([p])).toEqual({ c: 2, r: 5, w: 3, h: 3 })
  })

  it('spans every layer, so an overlay outside the wall still fits in the art', () => {
    const wall = repeat(new Map(), { c: 0, r: 0, w: 1, h: 1, sheet: WALLS }, at(1, 1), at(1, 1))
    const sign = repeat(new Map(), { c: 0, r: 0, w: 1, h: 1, sheet: WALLS }, at(3, 4), at(3, 4))
    expect(bounds([wall, sign])).toEqual({ c: 1, r: 1, w: 3, h: 4 })
  })
})

describe('flatten', () => {
  const wallsImg = { walls: true } as unknown as CanvasImageSource
  const propsImg = { props: true } as unknown as CanvasImageSource
  const sheets = new Map([[WALLS, wallsImg], [PROPS, propsImg]])
  const recorder = () => {
    const calls: [CanvasImageSource, ...number[]][] = []
    return {
      calls,
      ctx: {
        imageSmoothingEnabled: true,
        drawImage: (i: CanvasImageSource, ...a: number[]) => calls.push([i, ...a]),
      },
    }
  }
  const run = (ctx: unknown, layers: Placed[]) =>
    flatten(ctx as CanvasRenderingContext2D, sheets, layers, 32, bounds(layers)!)

  it('draws each placed cell from its source tile, offset to the bounding box origin', () => {
    const { calls, ctx } = recorder()
    const p = repeat(new Map(), { c: 4, r: 1, w: 1, h: 1, sheet: WALLS }, at(3, 2), at(3, 2))
    run(ctx, [p])
    expect(ctx.imageSmoothingEnabled).toBe(false)
    expect(calls).toEqual([[wallsImg, 128, 32, 32, 32, 0, 0, 32, 32]])
  })

  it('draws the layers bottom-up, each from its own sheet — the sign lands on the wall', () => {
    const { calls, ctx } = recorder()
    const wall = repeat(new Map(), { c: 1, r: 0, w: 1, h: 1, sheet: WALLS }, at(0, 0), at(0, 0))
    const sign = repeat(new Map(), { c: 7, r: 0, w: 1, h: 1, sheet: PROPS }, at(0, 0), at(0, 0))
    run(ctx, [wall, sign])
    expect(calls.map((a) => [a[0], a[1]])).toEqual([[wallsImg, 32], [propsImg, 224]])
  })

  it('skips a cell whose sheet has not loaded rather than drawing the wrong art', () => {
    const { calls, ctx } = recorder()
    const stray = repeat(new Map(), { c: 0, r: 0, w: 1, h: 1, sheet: 'gone/never-loaded' }, at(0, 0), at(0, 0))
    const wall = repeat(new Map(), { c: 1, r: 0, w: 1, h: 1, sheet: WALLS }, at(1, 0), at(1, 0))
    run(ctx, [stray, wall])
    expect(calls.map((a) => a[0])).toEqual([wallsImg])
  })
})

describe('overlaps', () => {
  it('is true when the stamp lands on a cell the layer already fills', () => {
    const wall = repeat(new Map(), { c: 0, r: 0, w: 2, h: 2, sheet: WALLS }, at(0, 0), at(0, 0))
    expect(overlaps(wall, { c: 5, r: 5, w: 1, h: 1, sheet: WALLS }, at(1, 1), at(1, 1))).toBe(true)
  })

  it('is false on an empty cell', () => {
    const wall = repeat(new Map(), { c: 0, r: 0, w: 2, h: 2, sheet: WALLS }, at(0, 0), at(0, 0))
    expect(overlaps(wall, { c: 5, r: 5, w: 1, h: 1, sheet: WALLS }, at(9, 9), at(9, 9))).toBe(false)
  })
})
