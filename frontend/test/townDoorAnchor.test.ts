import { describe, expect, it } from 'vitest'

import { buildTown, doorAnchorFor } from '../src/game/town.ts'

// The town derives a plot door anchor from the active "building" tile-object
// (or undefined → bottom-centre default). Only objects that actually authored a
// numeric door cell override the default; trees/flowers/absent leave it null.
describe('doorAnchorFor', () => {
  it('returns the authored cell for a building that declared one', () => {
    expect(doorAnchorFor({ door_dx: 0, door_dy: 2 })).toEqual({ dx: 0, dy: 2 })
  })

  it('is undefined when no anchor was authored', () => {
    expect(doorAnchorFor(null)).toBeUndefined()
    expect(doorAnchorFor({ door_dx: null, door_dy: null })).toBeUndefined()
  })
})

// The door is the only authored bit of building placement (issue #29). Without
// an anchor every plot keeps today's bottom-centre door (col+1, row+3); with
// one, every plot's door cell shifts by the authored offset — and that single
// cell is what isWalkable / playerDepthAt / townInteractions all read.
describe('buildTown door anchor', () => {
  it('defaults each plot door to bottom-centre', () => {
    const { plots } = buildTown(3)
    for (const p of plots) {
      expect(p.doorCol).toBe(p.col + 1)
      expect(p.doorRow).toBe(p.row + 3)
    }
  })

  it('honours an authored door offset on every plot', () => {
    const { plots } = buildTown(3, { dx: 0, dy: 1 })
    for (const p of plots) {
      expect(p.doorCol).toBe(p.col + 0)
      expect(p.doorRow).toBe(p.row + 1)
    }
  })

  it('clamps the offset into the 3x4 plot footprint', () => {
    const { plots } = buildTown(1, { dx: 9, dy: 9 })
    const p = plots[0]
    expect(p.doorCol).toBe(p.col + 2) // w=3 -> max dx 2
    expect(p.doorRow).toBe(p.row + 3) // h=4 -> max dy 3
  })
})
