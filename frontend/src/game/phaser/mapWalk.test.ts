// The authored-map walkability rule (#131, Tiled T3). Pins the pure composition
// the collision-mask slice adds on top of the tracer's in-bounds-only rule (#91):
// a cell is walkable only when it is in bounds AND not painted into the collision
// mask AND not blocked by a placed entity's walk-mask. Each veto is independent —
// none overrides another — so this locks all three failure modes.

import { describe, expect, it } from 'vitest'
import { mapWalkable, isMasked, entityBlockedFor } from './mapWalk.ts'
import type { BakedEntity } from '../../maps/schema.ts'

const SIZE = { cols: 3, rows: 3 }

describe('isMasked', () => {
  it('reads a row-major blocked grid, treating missing cells as unmasked', () => {
    const mask = [
      [false, true, false],
      [false, false, false],
    ]
    expect(isMasked(mask, 1, 0)).toBe(true)
    expect(isMasked(mask, 0, 0)).toBe(false)
    // Out of the mask's rows/cols reads as unmasked, never throws.
    expect(isMasked(mask, 2, 5)).toBe(false)
    expect(isMasked(undefined, 0, 0)).toBe(false)
  })
})

describe('mapWalkable', () => {
  it('walks any in-bounds cell when nothing is masked (tracer parity)', () => {
    const walk = mapWalkable(SIZE)
    expect(walk(0, 0)).toBe(true)
    expect(walk(2, 2)).toBe(true)
    // Out of bounds is still refused.
    expect(walk(-1, 0)).toBe(false)
    expect(walk(3, 0)).toBe(false)
  })

  it('blocks a masked cell and walks its unmasked neighbours', () => {
    const mask = [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ]
    const walk = mapWalkable(SIZE, mask)
    expect(walk(1, 1)).toBe(false) // masked → blocked
    expect(walk(0, 1)).toBe(true) // unmasked → walks
    expect(walk(1, 0)).toBe(true)
  })

  it('still applies an entity walk-mask on top of the collision mask', () => {
    const mask = [
      [true, false, false],
      [false, false, false],
      [false, false, false],
    ]
    const entityBlocked = (x: number, y: number) => x === 2 && y === 2
    const walk = mapWalkable(SIZE, mask, entityBlocked)
    expect(walk(0, 0)).toBe(false) // collision mask blocks
    expect(walk(2, 2)).toBe(false) // entity walk-mask blocks
    expect(walk(1, 1)).toBe(true) // neither blocks → walks
  })
})

describe('entityBlockedFor', () => {
  const prop: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 1, y: 1 }

  it('blocks nothing for props with no walk-mask (today authored maps)', () => {
    const blocked = entityBlockedFor([prop])
    expect(blocked(1, 1)).toBe(false)
  })

  it('blocks every solid footprint cell anchored at the entity origin', () => {
    // A 2×2 house at (1,1) whose top-left is solid, rest walkable overhang.
    const house: BakedEntity = {
      kind: 'house',
      tileset: 't',
      frame: 0,
      x: 1,
      y: 1,
      walk_mask: ['#.', '..'],
    }
    const blocked = entityBlockedFor([house])
    expect(blocked(1, 1)).toBe(true) // '#' at footprint (0,0) → cell (1,1)
    expect(blocked(2, 1)).toBe(false) // '.' overhang
    expect(blocked(1, 2)).toBe(false)
    expect(blocked(0, 0)).toBe(false) // outside footprint
  })
})
