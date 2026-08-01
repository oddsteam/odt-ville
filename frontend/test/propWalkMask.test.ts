import { describe, expect, it } from 'vitest'

import { authorsWalkMask, buildEdgeMask, buildWalkMask, edgeSetFromMask, ladderCellsFromMask, overhangCellsFromMask, requiresDoorValidation, walkCellsFromMask } from '../src/tileMapper/masks.ts'
import { validateWalkMask } from '../src/kernel/walkMask.ts'

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

describe('requiresDoorValidation (the #338/#343 no-door split)', () => {
  const door = { dx: 1, dy: 0 }

  it('runs only for a building that has a door placed', () => {
    expect(requiresDoorValidation('building', door)).toBe(true)
    // A collidable prop never has a door, so it always skips the guard.
    expect(requiresDoorValidation('prop', door)).toBe(false)
    expect(requiresDoorValidation('tree', door)).toBe(false)
  })

  it('skips a door-less building — it saves as solid scenery (#343)', () => {
    expect(requiresDoorValidation('building', null)).toBe(false)
    expect(requiresDoorValidation('building', undefined)).toBe(false)
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

// #343 — a building's door is optional. With no door placed a building is pure
// scenery: its footprint saves as a solid box (a Collides prop with nothing
// carved) and the save-time door-reachability guard never runs. A door that IS
// placed keeps the full #32 guard, since an unreachable door is always a mistake.
describe('a door-optional building (#343)', () => {
  it('a door-less building skips the guard and saves a solid footprint', () => {
    // The mask a door-less building saves: buildWalkMask over an empty paint set.
    expect(buildWalkMask(new Set(), 3, 2)).toEqual(['###', '###'])
    expect(requiresDoorValidation('building', null)).toBe(false)
  })

  it('a placed door still runs the guard and blocks an unreachable door', () => {
    const door = { dx: 1, dy: 1 }
    expect(requiresDoorValidation('building', door)).toBe(true)
    // Door at an interior cell with no carved path out — unreachable, still blocked.
    const island = buildWalkMask(new Set(['1,1']), 3, 3)
    expect(validateWalkMask(island, 3, 3, door)).toEqual({ ok: false, reason: 'unreachable' })
  })

  it('a placed door with a carved path to the edge saves as before', () => {
    const door = { dx: 1, dy: 2 }
    expect(requiresDoorValidation('building', door)).toBe(true)
    // A column of walkable cells from the door up to the top edge.
    const reachable = buildWalkMask(new Set(['1,0', '1,1', '1,2']), 3, 3)
    expect(validateWalkMask(reachable, 3, 3, door)).toEqual({ ok: true })
  })
})
