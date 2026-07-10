// Town walkability predicate coverage (#172). The collision-mask and
// entity-walk-mask cases live in mapWalk.test.ts; this pins the two the town
// path owns — terrain (blocked tile classes vs. ground + dynamic blockers) and
// edge-blocking (authored impassable cell borders, #53). Characterisation only:
// no behaviour change, these lock today's rules.

import { describe, expect, it } from 'vitest'
import { isWalkable, edgeBlocked, type Building } from './town.ts'

describe('isWalkable — terrain', () => {
  // 'T' tree and 's' signpost block; road ':' and grass '.' are ground.
  const town = { cols: 4, rows: 1, map: ['T:.s'] }

  it('blocks tree/sign tile classes and walks the ground between them', () => {
    expect(isWalkable(town, [], new Set(), 0, 0)).toBe(false) // 'T'
    expect(isWalkable(town, [], new Set(), 3, 0)).toBe(false) // 's'
    expect(isWalkable(town, [], new Set(), 1, 0)).toBe(true) // ':' road
    expect(isWalkable(town, [], new Set(), 2, 0)).toBe(true) // '.' grass
    // Out of bounds reads as a boundary tree → blocked.
    expect(isWalkable(town, [], new Set(), 9, 0)).toBe(false)
  })

  it('blocks a cell in the dynamic blockers set', () => {
    expect(isWalkable(town, [], new Set(['2,0']), 2, 0)).toBe(false)
  })
})

describe('edgeBlocked — authored cell borders (#53)', () => {
  // A 1×1 building at (0,0) whose only cell marks its south side impassable
  // (EDGE_S = 4). doorCol/Row off-grid so no cell reads as a door.
  const walled: Building = { col: 0, row: 0, w: 1, h: 1, doorCol: -1, doorRow: -1, edges: ['4'] }

  it('blocks the step across the marked border but not other directions', () => {
    expect(edgeBlocked([walled], 0, 0, 0, 1)).toBe(true) // step south → blocked
    expect(edgeBlocked([walled], 0, 0, 1, 0)).toBe(false) // step east → free
  })

  it('never blocks a building with no edge mask', () => {
    const open: Building = { col: 0, row: 0, w: 1, h: 1, doorCol: -1, doorRow: -1 }
    expect(edgeBlocked([open], 0, 0, 0, 1)).toBe(false)
  })
})
