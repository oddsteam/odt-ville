import { describe, expect, it } from 'vitest'

import { isWalkable } from '../src/game/town.ts'

// 4x3 grid with a signpost at (2,0). One building: footprint x∈[0,2) y∈[0,3),
// door at (0,2) — deliberately inside the footprint to prove door wins.
const town = { cols: 4, rows: 3, map: ['..s.', '....', '....'] }
const buildings = [{ col: 0, row: 0, w: 2, h: 3, doorCol: 0, doorRow: 2 }]
const none = new Set<string>()

describe('isWalkable', () => {
  it('lets the player onto a door tile, even inside the footprint', () => {
    expect(isWalkable(town, buildings, none, 0, 2)).toBe(true)
  })

  it('blocks a building footprint tile that is not the door', () => {
    expect(isWalkable(town, buildings, none, 1, 1)).toBe(false)
  })

  it('blocks a blocked tile class (the signpost)', () => {
    expect(isWalkable(town, buildings, none, 2, 0)).toBe(false)
  })

  it('blocks a tall-prop cell from the blockers set', () => {
    expect(isWalkable(town, buildings, new Set(['3,2']), 3, 2)).toBe(false)
  })

  it('blocks the gate-trainer tile from the blockers set', () => {
    expect(isWalkable(town, buildings, new Set(['2,2']), 2, 2)).toBe(false)
  })

  it('blocks out-of-bounds tiles', () => {
    expect(isWalkable(town, buildings, none, 4, 0)).toBe(false)
    expect(isWalkable(town, buildings, none, -1, 1)).toBe(false)
  })

  it('allows plain ground', () => {
    expect(isWalkable(town, buildings, none, 2, 2)).toBe(true)
  })

  // #44: an overhang cell ('o') is a walkable footprint cell — the avatar steps
  // onto it (and renders under the building art there, see townDepth).
  it('lets the player onto an overhang cell (walk-mask "o")', () => {
    const overhung = [{ col: 0, row: 0, w: 2, h: 3, doorCol: 0, doorRow: 2, mask: ['##', 'o#', '##'] }]
    expect(isWalkable(town, overhung, none, 0, 1)).toBe(true) // 'o' at dx0,dy1
  })
})
