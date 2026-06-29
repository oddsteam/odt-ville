import { describe, expect, it } from 'vitest'

import { buildWalkMask, ladderCellsFromMask } from '../src/tileMapper/TileMapper.tsx'

// Ladder cells (#54) paint as 'L' in the walk mask — walkable like '.', but the
// avatar climbs while on them. Overhang 'o' still wins; a ladder beats a plain
// porch '.'. A saved mask round-trips back to the painted ladder set.
describe('buildWalkMask ladders', () => {
  it('renders ladder cells as "L", overriding "."', () => {
    const walk = new Set(['0,0', '0,1'])
    const ladder = new Set(['0,1', '1,1'])
    expect(buildWalkMask(walk, 2, 2, new Set(), ladder)).toEqual(['.#', 'LL'])
  })

  it('lets overhang "o" win over a ladder cell', () => {
    const overhang = new Set(['0,0'])
    const ladder = new Set(['0,0'])
    expect(buildWalkMask(new Set(), 1, 1, overhang, ladder)).toEqual(['o'])
  })

  it('round-trips ladder cells back out of a stored mask', () => {
    expect(ladderCellsFromMask(['.#', 'LL'])).toEqual(new Set(['0,1', '1,1']))
  })
})
