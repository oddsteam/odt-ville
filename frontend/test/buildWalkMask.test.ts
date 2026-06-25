import { describe, expect, it } from 'vitest'

import { buildWalkMask } from '../src/tileMapper/TileMapper.tsx'

// The mapper paints walkable cells onto the building footprint grid; this turns
// that painted set into the row-major mask the town stamps (#32): '.' walkable,
// '#' solid.
describe('buildWalkMask', () => {
  it('renders painted cells as "." and the rest as "#"', () => {
    const walk = new Set(['1,1', '1,2', '1,3'])
    expect(buildWalkMask(walk, 3, 4)).toEqual(['###', '#.#', '#.#', '#.#'])
  })

  it('ignores painted cells outside the footprint bounds', () => {
    const walk = new Set(['0,0', '9,9'])
    expect(buildWalkMask(walk, 2, 2)).toEqual(['.#', '##'])
  })

  it('is all solid when nothing is painted', () => {
    expect(buildWalkMask(new Set(), 2, 2)).toEqual(['##', '##'])
  })
})
