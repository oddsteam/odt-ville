import { describe, expect, it } from 'vitest'

import { bounds, erase, flatten, repeat, type Placed } from './composition.ts'

const BLOCK = { c: 4, r: 0, w: 2, h: 1 } // a 2-wide strip at source cells (4,0)-(5,0)
const at = (c: number, r: number) => ({ c, r })
const keys = (p: Placed) => [...p.keys()].sort()

describe('repeat', () => {
  it('stamps the block once when the drag never leaves the anchor cell', () => {
    const p = repeat(new Map(), BLOCK, at(0, 0), at(0, 0))
    expect(keys(p)).toEqual(['0,0', '1,0'])
    expect(p.get('0,0')).toEqual([4, 0])
    expect(p.get('1,0')).toEqual([5, 0])
  })

  it('repeats the block along the drag, stepping by the block size', () => {
    const p = repeat(new Map(), BLOCK, at(0, 0), at(5, 0))
    expect(keys(p)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0'])
    expect(p.get('4,0')).toEqual([4, 0]) // the third copy starts the block again
  })

  it('repeats away from the anchor when the drag goes up, so a tower stays aligned', () => {
    const floor = { c: 0, r: 2, w: 1, h: 2 }
    const p = repeat(new Map(), floor, at(0, 8), at(0, 5))
    expect(keys(p)).toEqual(['0,6', '0,7', '0,8', '0,9'])
    expect(p.get('0,8')).toEqual([0, 2]) // the anchor cell keeps the block's top row
  })

  it('replaces what is already in a cell instead of stacking', () => {
    const first = repeat(new Map(), { c: 0, r: 0, w: 1, h: 1 }, at(3, 3), at(3, 3))
    const second = repeat(first, { c: 9, r: 9, w: 1, h: 1 }, at(3, 3), at(3, 3))
    expect(second.get('3,3')).toEqual([9, 9])
    expect(second.size).toBe(1)
  })
})

describe('erase', () => {
  it('clears every cell in the dragged rectangle and leaves the rest', () => {
    const p = repeat(new Map(), { c: 0, r: 0, w: 4, h: 2 }, at(0, 0), at(0, 0))
    expect(keys(erase(p, at(1, 1), at(2, 0)))).toEqual(['0,0', '0,1', '3,0', '3,1'])
  })
})

describe('bounds', () => {
  it('is null while nothing is placed', () => {
    expect(bounds(new Map())).toBeNull()
  })

  it('is the inclusive bounding box of the placed cells', () => {
    const p = erase(repeat(new Map(), { c: 0, r: 0, w: 3, h: 3 }, at(2, 5), at(2, 5)), at(2, 5), at(2, 5))
    expect(bounds(p)).toEqual({ c: 2, r: 5, w: 3, h: 3 })
  })
})

describe('flatten', () => {
  it('draws each placed cell from its source tile, offset to the bounding box origin', () => {
    const calls: number[][] = []
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (_img: unknown, ...args: number[]) => calls.push(args),
    }
    const p = repeat(new Map(), { c: 4, r: 1, w: 1, h: 1 }, at(3, 2), at(3, 2))
    flatten(ctx as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, p, 32, bounds(p)!)
    expect(ctx.imageSmoothingEnabled).toBe(false)
    expect(calls).toEqual([[128, 32, 32, 32, 0, 0, 32, 32]])
  })
})
