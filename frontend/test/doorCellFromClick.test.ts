import { describe, expect, it } from 'vitest'

import { doorCellFromClick } from '../src/tileMapper/selection.ts'

// The building door picker maps a click on the footprint preview (rectW×rectH
// px showing cols×rows tiles) to a clamped cell offset the town uses as the
// entrance (issue #29).
describe('doorCellFromClick', () => {
  it('maps a click to the tile under it', () => {
    // 3x4 footprint in a 300x400 preview -> 100px per cell.
    expect(doorCellFromClick(150, 350, 300, 400, 3, 4)).toEqual({ dx: 1, dy: 3 })
    expect(doorCellFromClick(10, 10, 300, 400, 3, 4)).toEqual({ dx: 0, dy: 0 })
  })

  it('clamps a click on the far edge into the footprint', () => {
    expect(doorCellFromClick(300, 400, 300, 400, 3, 4)).toEqual({ dx: 2, dy: 3 })
  })
})
