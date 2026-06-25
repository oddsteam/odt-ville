import { describe, expect, it } from 'vitest'

import { playerDepthAt } from '../src/game/town.ts'

// Building sprite draws at (row+h)*10 - 1 (see townRenderer); the player on the
// door tile must beat that so it reads as standing in the doorway, not under it.
const building = { col: 2, row: 4, w: 3, h: 4, doorCol: 3, doorRow: 7 }

describe('playerDepthAt', () => {
  it('elevates the player above the building on its door tile', () => {
    expect(playerDepthAt([building], 3, 7)).toBe(80) // building is at 79
  })

  it('uses the row-banded depth off any door tile', () => {
    expect(playerDepthAt([building], 3, 8)).toBe(85) // street tile below the door
    expect(playerDepthAt([building], 0, 0)).toBe(5)
  })

  // #32: standing on an authored walk-mask path cell (porch) must also beat the
  // building sprite, or the avatar clips under the house on its own porch.
  const masked = { ...building, mask: ['###', '###', '#.#', '#.#'] } // dy=2 & door row dy=3 walkable

  it('elevates the player above the building on a walk-mask path cell, not just the door', () => {
    // (x=3,y=6) -> mask cell dx=1,dy=2 = '.', a non-door porch tile.
    expect(playerDepthAt([masked], 3, 6)).toBe(80) // building is at 79; default would be 65
  })

  it('keeps the row-banded depth on a solid (non-walkable) footprint cell', () => {
    // (x=2,y=6) -> mask cell dx=0,dy=2 = '#', not standable.
    expect(playerDepthAt([masked], 2, 6)).toBe(65)
  })
})
