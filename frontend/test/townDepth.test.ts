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
})
