import { describe, expect, it } from 'vitest'

import { buildEdgeMask, edgeSetFromMask, edgeSideFromClick } from '../src/tileMapper/TileMapper.tsx'

// The mapper paints impassable cell borders as "c,r,side" keys (#53); this turns
// that set into the row-major hex edge mask the town stamps. Bits N=1 E=2 S=4 W=8.
describe('buildEdgeMask', () => {
  it('packs each cell\'s marked sides into one hex digit', () => {
    // cell (1,1): south (4) + west (8) = 12 -> 'c'.
    const edges = new Set(['1,1,S', '1,1,W'])
    expect(buildEdgeMask(edges, 3, 4)).toEqual(['000', '0c0', '000', '000'])
  })

  it('is all zero when nothing is marked', () => {
    expect(buildEdgeMask(new Set(), 2, 2)).toEqual(['00', '00'])
  })

  it('ignores marks outside the footprint bounds', () => {
    expect(buildEdgeMask(new Set(['0,0,N', '9,9,S']), 2, 2)).toEqual(['10', '00'])
  })

  it('round-trips back out of a stored mask', () => {
    expect(edgeSetFromMask(['000', '0c0', '000', '000'])).toEqual(new Set(['1,1,S', '1,1,W']))
  })
})

describe('edgeSideFromClick', () => {
  // A 2x2 footprint preview 100x100 px (each cell 50px).
  const pick = (px: number, py: number) => edgeSideFromClick(px, py, 100, 100, 2, 2)

  it('picks the nearest side of the clicked cell', () => {
    expect(pick(25, 2)).toEqual({ c: 0, r: 0, side: 'N' }) // top edge of (0,0)
    expect(pick(25, 48)).toEqual({ c: 0, r: 0, side: 'S' }) // bottom edge of (0,0)
    expect(pick(2, 75)).toEqual({ c: 0, r: 1, side: 'W' }) // left edge of (0,1)
    expect(pick(98, 75)).toEqual({ c: 1, r: 1, side: 'E' }) // right edge of (1,1)
  })
})
