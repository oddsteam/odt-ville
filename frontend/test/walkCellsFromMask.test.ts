import { describe, expect, it } from 'vitest'

import { buildWalkMask, walkCellsFromMask } from '../src/tileMapper/masks.ts'

// walkCellsFromMask is the inverse of buildWalkMask: a stored row-major walk
// mask ('.' walkable, '#' solid) loads back into the editor's set of painted
// "dx,dy" cells, so a saved building can be re-opened to adjust its path (#32).
describe('walkCellsFromMask', () => {
  it('collects every "." cell as a dx,dy key', () => {
    expect(walkCellsFromMask(['###', '#.#', '#.#', '#.#'])).toEqual(
      new Set(['1,1', '1,2', '1,3']),
    )
  })

  it('is empty for an all-solid mask', () => {
    expect(walkCellsFromMask(['###', '###'])).toEqual(new Set())
  })

  it('round-trips with buildWalkMask', () => {
    const mask = ['#.#', '...', '#.#']
    expect(buildWalkMask(walkCellsFromMask(mask), 3, 3)).toEqual(mask)
  })
})
