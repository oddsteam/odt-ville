import { describe, expect, it } from 'vitest'

import {
  buildTown,
  clampFootprint,
  defaultDoorFor,
  footprintFor,
  tileChar,
  typeForTileChar,
} from '../src/game/town.ts'

// A plot's footprint is sourced from the active mapped building (#30), clamped
// to a sane range so the grid never runs away: width 3..6, height 4..6. Today's
// 3x4 is the minimum (nameplate + roof/body split need it); 6x6 the cap.
describe('clampFootprint', () => {
  it('passes an in-range footprint through, floored to whole tiles', () => {
    expect(clampFootprint(4, 5)).toEqual({ w: 4, h: 5 })
    expect(clampFootprint(4.9, 5.9)).toEqual({ w: 4, h: 5 })
  })

  it('clamps each dimension to [3..6] x [4..6]', () => {
    expect(clampFootprint(2, 2)).toEqual({ w: 3, h: 4 })
    expect(clampFootprint(9, 9)).toEqual({ w: 6, h: 6 })
    expect(clampFootprint(6, 3)).toEqual({ w: 6, h: 4 })
  })

  it('falls back to the minimum for non-finite input', () => {
    expect(clampFootprint(NaN, NaN)).toEqual({ w: 3, h: 4 })
  })
})

// The default door is computed bottom-centre of the footprint, so it lands on
// the perimeter (street below) for any size. At 3x4 that's {1,3} — no regression.
describe('defaultDoorFor', () => {
  it('is bottom-centre of the footprint', () => {
    expect(defaultDoorFor(3, 4)).toEqual({ dx: 1, dy: 3 })
    expect(defaultDoorFor(4, 5)).toEqual({ dx: 1, dy: 4 })
    expect(defaultDoorFor(6, 6)).toEqual({ dx: 2, dy: 5 })
  })
})

// Pulls the footprint off the active building tile-object, clamped; absent or
// nulls fall back to today's 3x4 so non-mapped towns stay identical.
describe('footprintFor', () => {
  it('reads and clamps the building footprint', () => {
    expect(footprintFor({ footprint_w: 4, footprint_h: 5 })).toEqual({ w: 4, h: 5 })
    expect(footprintFor({ footprint_w: 9, footprint_h: 1 })).toEqual({ w: 6, h: 4 })
  })

  it('defaults to 3x4 when no building or fields are present', () => {
    expect(footprintFor(null)).toEqual({ w: 3, h: 4 })
    expect(footprintFor({ footprint_w: null, footprint_h: null })).toEqual({ w: 3, h: 4 })
  })
})

describe('buildTown variable footprint', () => {
  it('sizes every plot to the clamped footprint', () => {
    const { plots } = buildTown(7, undefined, { w: 4, h: 5 })
    expect(plots).toHaveLength(7)
    for (const p of plots) {
      expect(p.w).toBe(4)
      expect(p.h).toBe(5)
    }
  })

  it('spaces plots by footprint width + 1 gap, with a 1-cell gap between them', () => {
    const { plots } = buildTown(2, undefined, { w: 4, h: 5 })
    // slot stride = w + 1 => columns 2 and 7
    expect(plots[0].col).toBe(2)
    expect(plots[1].col).toBe(2 + 5)
  })

  it('defaults the door to bottom-centre of the footprint', () => {
    const { plots } = buildTown(1, undefined, { w: 4, h: 5 })
    const p = plots[0]
    expect(p.doorCol).toBe(p.col + 1) // floor((4-1)/2)
    expect(p.doorRow).toBe(p.row + 4) // h-1
  })

  it('clamps an authored door to the footprint bounds (not the 3x4 box)', () => {
    const { plots } = buildTown(1, { dx: 9, dy: 9 }, { w: 5, h: 6 })
    const p = plots[0]
    expect(p.doorCol).toBe(p.col + 4) // w=5 -> max dx 4
    expect(p.doorRow).toBe(p.row + 5) // h=6 -> max dy 5
  })

  it('snaps an unreachable interior door to the computed default', () => {
    // {dx:2,dy:2} sits inside a 6x6 footprint with no orthogonal neighbour
    // outside the box -> unplayable, so it snaps to bottom-centre.
    const { plots } = buildTown(1, { dx: 2, dy: 2 }, { w: 6, h: 6 })
    const p = plots[0]
    expect(p.doorCol).toBe(p.col + 2) // default dx floor((6-1)/2)
    expect(p.doorRow).toBe(p.row + 5) // default dy h-1
  })

  it('keeps a perimeter door that is not bottom-centre', () => {
    const { plots } = buildTown(1, { dx: 0, dy: 1 }, { w: 5, h: 6 })
    const p = plots[0]
    expect(p.doorCol).toBe(p.col + 0)
    expect(p.doorRow).toBe(p.row + 1)
  })
})

// The autotile no-thin-strip invariant must survive across the supported
// footprint range, not just 3x4 — the grass gaps that protect it are fixed
// constants that don't scale with the building extent.
describe('buildTown footprint invariants', () => {
  const footprints = [
    { w: 3, h: 4 },
    { w: 4, h: 5 },
    { w: 6, h: 3 }, // clamps to 6x4
    { w: 6, h: 6 },
  ]

  it('produces no one-tile-wide autotiled (grass/dirt) strips', () => {
    const autotiled = new Set(['grass', 'dirt'])
    for (const fp of footprints) {
      for (let plotCount = 1; plotCount <= 12; plotCount++) {
        const town = buildTown(plotCount, undefined, fp)
        for (let y = 0; y < town.rows; y++) {
          for (let x = 0; x < town.cols; x++) {
            const terrain = typeForTileChar(town.map[y][x])
            if (!terrain || !autotiled.has(terrain)) continue
            const n = typeForTileChar(tileChar(town, x, y - 1))
            const s = typeForTileChar(tileChar(town, x, y + 1))
            const e = typeForTileChar(tileChar(town, x + 1, y))
            const w = typeForTileChar(tileChar(town, x - 1, y))
            const vertical = n && s && n !== terrain && s !== terrain
            const horizontal = e && w && e !== terrain && w !== terrain
            expect(vertical || horizontal, `fp=${fp.w}x${fp.h} plotCount=${plotCount} (${x},${y})`).toBe(
              false,
            )
          }
        }
      }
    }
  })
})
