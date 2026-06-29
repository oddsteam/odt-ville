import { describe, expect, it } from 'vitest'

import {
  isLadderCell,
  isWalkable,
  playerDepthAt,
  validateWalkMask,
} from '../src/game/town.ts'

// Ladder cells (#54): a new walk-mask state 'L' — walkable like a path '.', but
// flagged so the avatar plays its climb posture while standing on it. Like '.',
// a ladder cell is drawn OVER the building (depth lifted), and counts as a
// walkable tile for save-time validation. Opt-in: only buildings that author an
// 'L' cell behave differently.

const town = { cols: 5, rows: 5, map: ['.....', '.....', '.....', '.....', '.....'] }
const none = new Set<string>()
// 3x4 footprint; a ladder cell at {1,1}, door bottom-centre {1,3}, '.' column up.
const mask = ['###', '#L#', '#.#', '#.#']
const buildings = [{ col: 0, row: 0, w: 3, h: 4, doorCol: 1, doorRow: 3, mask }]

describe('ladder cells', () => {
  it('is walkable like a path', () => {
    expect(isWalkable(town, buildings, none, 1, 1)).toBe(true)
  })

  it('isLadderCell is true on the ladder cell, false elsewhere', () => {
    expect(isLadderCell(buildings, 1, 1)).toBe(true)
    expect(isLadderCell(buildings, 1, 2)).toBe(false) // a plain '.' porch
    expect(isLadderCell(buildings, 0, 0)).toBe(false) // solid
    expect(isLadderCell(buildings, 9, 9)).toBe(false) // off the footprint
  })

  it('lifts the avatar over the building, like a porch', () => {
    // playerDepthAt collapses to (row+h)*10 on a lifted cell, beating the row default.
    expect(playerDepthAt(buildings, 1, 1)).toBe((0 + 4) * 10)
  })

  it('counts as a walkable tile for save validation', () => {
    // A mask whose only painted tiles are ladders still passes the no-walkable check.
    const ladderOnly = ['###', '#L#', '#L#', '#L#']
    expect(validateWalkMask(ladderOnly, 3, 4, { dx: 1, dy: 3 }).ok).toBe(true)
  })
})
