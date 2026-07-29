import { describe, expect, it } from 'vitest'

import {
  authorsWalkMask,
  buildEdgeMask,
  buildWalkMask,
  edgeSetFromMask,
  ladderCellsFromMask,
  overhangCellsFromMask,
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

// #339 — overhang painting on collidable props. The Overhang, Ladder, and Edge
// paint modes (building-only until now) become available once a prop authors a
// walk_mask, i.e. exactly when authorsWalkMask is true. The mask/edge builders
// are kind-agnostic, so a collidable prop emits 'o'/'L'/edge just like a
// building; the runtime already renders any placed object's 'o' cells (#210).
describe('a collidable prop authoring overhang / ladder / edge (#339)', () => {
  it('gates the three modes on authorsWalkMask — on for a collidable prop, off otherwise', () => {
    expect(authorsWalkMask('prop', true)).toBe(true)
    expect(authorsWalkMask('prop', false)).toBe(false)
    expect(authorsWalkMask('tree', true)).toBe(false)
  })

  it("emits 'o' overhang and 'L' ladder cells in the prop's saved mask", () => {
    const walk = new Set(['1,1'])
    const overhang = new Set(['0,0'])
    const ladder = new Set(['2,0'])
    // Precedence in buildWalkMask: overhang > ladder > walk > solid.
    expect(buildWalkMask(walk, 3, 2, overhang, ladder)).toEqual(['o#L', '#.#'])
  })

  it("round-trips a prop's overhang and ladder cells back out of the mask", () => {
    const mask = buildWalkMask(new Set(['1,1']), 3, 2, new Set(['0,0']), new Set(['2,0']))
    expect(overhangCellsFromMask(mask)).toEqual(new Set(['0,0']))
    expect(ladderCellsFromMask(mask)).toEqual(new Set(['2,0']))
  })

  it('builds an impassable edge mask for a prop, now reachable via the Edge mode (#53)', () => {
    const edges = new Set(['0,0,N', '1,1,E'])
    const mask = buildEdgeMask(edges, 2, 2)
    // N=1 at (0,0); E=2 at (1,1).
    expect(mask).toEqual(['10', '02'])
    expect(edgeSetFromMask(mask)).toEqual(edges)
  })
})
