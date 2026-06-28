import { describe, expect, it } from 'vitest'

import { buildingOverlayDepth, playerDepthAt } from '../src/game/town.ts'

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

  // #44: an overhang cell ('o') is walkable but the avatar stays UNDER the house
  // art — its default row depth keeps it below the building sprite (79), the
  // inverse of a '.' porch cell which lifts it on top.
  const overhang = { ...building, mask: ['###', '###', '#o#', '#.#'] } // dy=2 'o', dy=3 '.'

  it('keeps the avatar under the building on an overhang cell', () => {
    expect(playerDepthAt([overhang], 3, 6)).toBe(65) // 'o' at dx1,dy2 → default, under 79
  })

  it('still lifts the avatar on a porch cell of the same building', () => {
    expect(playerDepthAt([overhang], 3, 7)).toBe(80) // '.' at dx1,dy3 → over the house
  })

  // #46: with a door north of the footprint's south edge, the avatar must stay
  // above the building sprite on every door-column tile from the door down to
  // the edge, or it vanishes mid-exit on the tile directly south of the door.
  const midDoor = { col: 2, row: 4, w: 3, h: 4, doorCol: 3, doorRow: 6 }

  it('elevates the player on the footprint tile south of the door (exit corridor)', () => {
    // (x=3,y=7): inside the footprint, directly south of the door, not the door tile.
    expect(playerDepthAt([midDoor], 3, 7)).toBeGreaterThan(79) // building is at 79; default would be 75
  })
})

// #36: the foreground-mask overlay sits in a thin depth band just above the
// building's south band, so it covers the avatar while the avatar is on the
// building but the avatar (whose depth jumps to its own row south of the
// footprint) covers it once outside. Boundary = the footprint's south edge.
describe('buildingOverlayDepth', () => {
  it('beats the avatar on the building and the house body, but loses to the avatar one row south', () => {
    expect(buildingOverlayDepth(building)).toBe(82) // (row+h)*10 + 2
    expect(buildingOverlayDepth(building)).toBeGreaterThan(playerDepthAt([building], 3, 7)) // over avatar on the door
    expect(buildingOverlayDepth(building)).toBeGreaterThan((building.row + building.h) * 10 - 1) // over the house body sprite
    expect(playerDepthAt([building], 0, building.row + building.h)).toBeGreaterThan(buildingOverlayDepth(building)) // avatar wins south of the footprint
  })
})
