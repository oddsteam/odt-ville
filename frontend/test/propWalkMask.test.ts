import { describe, expect, it } from 'vitest'

import {
  authorsWalkMask,
  buildWalkMask,
  requiresDoorValidation,
  walkCellsFromMask,
} from '../src/tileMapper/TileMapper.tsx'

// #338 — "Collides" authoring on props. A prop with Collides on carries a
// walk_mask like a building (solid footprint, Walkable carves pass-through) but
// never runs the building door-reachability guard, since a prop has no door.

describe('authorsWalkMask', () => {
  it('is always true for a building, regardless of the collides flag', () => {
    expect(authorsWalkMask('building', false)).toBe(true)
    expect(authorsWalkMask('building', true)).toBe(true)
  })

  it('is true for a prop only when Collides is on', () => {
    expect(authorsWalkMask('prop', true)).toBe(true)
    expect(authorsWalkMask('prop', false)).toBe(false)
  })

  it('is false for every other kind, so plain decoration saves no mask', () => {
    expect(authorsWalkMask('tree', true)).toBe(false)
    expect(authorsWalkMask('flower-group', true)).toBe(false)
    expect(authorsWalkMask('flower-single', true)).toBe(false)
  })
})

describe('requiresDoorValidation (the #338 no-door split)', () => {
  it('runs only for buildings — a collidable prop skips the door guard', () => {
    expect(requiresDoorValidation('building')).toBe(true)
    expect(requiresDoorValidation('prop')).toBe(false)
    expect(requiresDoorValidation('tree')).toBe(false)
  })
})

describe('a collidable prop mask', () => {
  // The footprint defaults solid ('#', same convention as a building); the
  // Walkable paint carves the pass-through cells the avatar may cross.
  it('builds a solid footprint with the painted cells carved walkable', () => {
    const walk = new Set(['0,1', '2,1'])
    expect(buildWalkMask(walk, 3, 2)).toEqual(['###', '.#.'])
  })

  it('is fully solid when nothing is carved (blocks the whole footprint)', () => {
    expect(buildWalkMask(new Set(), 2, 2)).toEqual(['##', '##'])
  })

  it('round-trips a saved prop mask back into the painted carve set', () => {
    const mask = buildWalkMask(new Set(['0,0', '1,1']), 2, 2)
    expect(walkCellsFromMask(mask)).toEqual(new Set(['0,0', '1,1']))
  })
})
