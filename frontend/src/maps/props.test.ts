// Pins the prop-placement model (#139, ADR-0008): props are references to
// saved tile objects placed at their authored footprint — a 2×2 object claims
// 4 grid cells (occupancy, stacking, edge clamping, erase from any
// covered cell) — baked to object_id entities and reconstructed on re-open.

import { describe, expect, it } from 'vitest'
import { placeProp, erasePropAt, coveredCells, propEntities, propsFromBaked, objectIdsFrom, propGhost, nudgeProp, propIndexAt } from './props.ts'
import type { PlacedProp } from './props.ts'

// Object 7 is 2×2, object 9 is 1×1, object 5 is fractional (1.4×1.8 ≈ 2×2 cells).
const size = (id: number) => (id === 7 ? { w: 2, h: 2 } : id === 5 ? { w: 1.4, h: 1.8 } : { w: 1, h: 1 })
const bounds = { cols: 4, rows: 4 }
const place = (props: readonly PlacedProp[], p: PlacedProp) => placeProp(props, p, size, bounds)

describe('placeProp', () => {
  it('stacks a prop on top of one its footprint overlaps', () => {
    const one = place([], { object_id: 7, x: 1, y: 1 }) // covers (1..2, 1..2)
    expect(one).toHaveLength(1)

    // A 1×1 stamped on a covered (non-anchor) cell sits on the 2×2, appended last.
    const stacked = place(one, { object_id: 9, x: 2, y: 2 })
    expect(stacked).toEqual([{ object_id: 7, x: 1, y: 1 }, { object_id: 9, x: 2, y: 2 }])
  })

  it('allows a footprint that overflows the right/bottom edge (#340)', () => {
    // 2 wide at col 3 of 4 overflows right — now placed (anchor stays on-map).
    expect(place([], { object_id: 7, x: 3, y: 1 })).toEqual([{ object_id: 7, x: 3, y: 1 }])
    // 2 tall at row 3 of 4 overflows bottom — placed.
    expect(place([], { object_id: 7, x: 1, y: 3 })).toEqual([{ object_id: 7, x: 1, y: 3 }])
  })

  it('refuses a placement with no footprint cell on the map', () => {
    // Anchor at col 4 (== cols) puts the whole 2×2 off the right edge → refused.
    expect(place([], { object_id: 7, x: 4, y: 1 })).toEqual([])
    // Anchor at row 4 (== rows) puts the whole 2×2 below the map → refused.
    expect(place([], { object_id: 7, x: 1, y: 4 })).toEqual([])
  })

  it('rounds a fractional footprint up to whole cells for the edge test', () => {
    // 1.4×1.8 occupies 2×2 cells; anchor (3,3) overflows but keeps (3,3) on-map → placed.
    expect(place([], { object_id: 5, x: 3, y: 3 })).toEqual([{ object_id: 5, x: 3, y: 3 }])
    // Anchor (4,4) puts the whole ceiled 2×2 off-map → refused.
    expect(place([], { object_id: 5, x: 4, y: 4 })).toEqual([])
  })
})

describe('erasePropAt', () => {
  it('removes the prop covering a cell, even off its anchor', () => {
    const two = place(place([], { object_id: 7, x: 1, y: 1 }), { object_id: 9, x: 0, y: 0 })
    const after = erasePropAt(two, 2, 2, size) // covered corner of the 2×2
    expect(after).toEqual([{ object_id: 9, x: 0, y: 0 }])
    expect(erasePropAt(two, 3, 3, size)).toBe(two) // no-op off any prop
  })

  it('removes an edge-overflowing prop from an on-map covered cell (#340)', () => {
    // 2×2 at (3,3) covers (3..4, 3..4); only (3,3) is on a 4×4 map.
    const one = place([], { object_id: 7, x: 3, y: 3 })
    expect(erasePropAt(one, 3, 3, size)).toEqual([])
  })

  it('removes a negative-anchor prop from its on-map cell (#341)', () => {
    // 2×2 at (-1,-1) overhangs the top-left; only (0,0) is on-map, and erasing
    // from it removes the whole prop (rect-based over the intersection).
    const one: PlacedProp[] = [{ object_id: 7, x: -1, y: -1 }]
    expect(erasePropAt(one, 0, 0, size)).toEqual([])
    expect(erasePropAt(one, 1, 1, size)).toBe(one) // (1,1) is outside the footprint
  })
})

describe('coveredCells', () => {
  it('lists every cell each footprint occupies', () => {
    const cells = coveredCells([{ object_id: 7, x: 1, y: 1 }], size)
    expect(cells).toEqual(new Set(['1,1', '2,1', '1,2', '2,2']))
  })

  it('lists the off-map cells of a negative anchor too (#341)', () => {
    // 2×2 at (-1,-1) overhangs the top-left corner; only (0,0) lands on-map,
    // but every cell is listed — off-map keys are simply never queried.
    expect(coveredCells([{ object_id: 7, x: -1, y: -1 }], size)).toEqual(
      new Set(['-1,-1', '0,-1', '-1,0', '0,0']),
    )
  })
})

describe('nudgeProp', () => {
  const nudge = (props: readonly PlacedProp[], i: number, dir: Parameters<typeof nudgeProp>[2]) =>
    nudgeProp(props, i, dir, size, bounds)

  it('moves the selected prop one cell per press, tracking its new index', () => {
    const one = [{ object_id: 9, x: 1, y: 1 }]
    expect(nudge(one, 0, 'left')).toEqual({ props: [{ object_id: 9, x: 0, y: 1 }], index: 0 })
    expect(nudge(one, 0, 'up')).toEqual({ props: [{ object_id: 9, x: 1, y: 0 }], index: 0 })
    expect(nudge(one, 0, 'right')).toEqual({ props: [{ object_id: 9, x: 2, y: 1 }], index: 0 })
    expect(nudge(one, 0, 'down')).toEqual({ props: [{ object_id: 9, x: 1, y: 2 }], index: 0 })
  })

  it('crosses the top/left edge into a negative anchor while a cell stays on-map (#341)', () => {
    // 2×2 at (0,0) nudged left → anchor (-1,0); cell (0,0) still on-map.
    expect(nudge([{ object_id: 7, x: 0, y: 0 }], 0, 'left')).toEqual({
      props: [{ object_id: 7, x: -1, y: 0 }],
      index: 0,
    })
  })

  it('refuses a nudge that would push the last footprint cell off the map', () => {
    // 2×2 at (-1,0) covers cols (-1..0); nudging left → (-2,0) is fully off-map.
    const props = [{ object_id: 7, x: -1, y: 0 }]
    expect(nudge(props, 0, 'left')).toEqual({ props, index: 0 })
    // A 1×1 at the left edge has no cell to spare — any step left leaves the map.
    const unit = [{ object_id: 9, x: 0, y: 2 }]
    expect(nudge(unit, 0, 'left')).toEqual({ props: unit, index: 0 })
  })

  it('re-places through placeProp so a nudge onto another prop stacks on it', () => {
    // Two props; nudging the first onto the second keeps both and the moved
    // prop lands last in the list (placeProp append order) → its new index.
    const two = [{ object_id: 9, x: 0, y: 0 }, { object_id: 9, x: 1, y: 0 }]
    expect(nudge(two, 0, 'right')).toEqual({ props: [{ object_id: 9, x: 1, y: 0 }, { object_id: 9, x: 1, y: 0 }], index: 1 })
  })

  it('is a no-op for an out-of-range index', () => {
    const one = [{ object_id: 9, x: 1, y: 1 }]
    expect(nudge(one, 3, 'left')).toEqual({ props: one, index: 3 })
  })
})

describe('propIndexAt', () => {
  const props = [{ object_id: 7, x: 1, y: 1 }, { object_id: 9, x: 0, y: 0 }]

  it('finds the prop covering a cell, off its anchor, or -1 for none', () => {
    expect(propIndexAt(props, 2, 2, size)).toBe(0) // covered corner of the 2×2
    expect(propIndexAt(props, 0, 0, size)).toBe(1)
    expect(propIndexAt(props, 3, 3, size)).toBe(-1)
  })

  it('returns the last (topmost) prop when footprints overlap', () => {
    // A 1×1 restamped over the 2×2's cell — the later prop wins, matching the
    // overlap-replacement order placeProp uses.
    const stacked = [{ object_id: 7, x: 1, y: 1 }, { object_id: 9, x: 2, y: 2 }]
    expect(propIndexAt(stacked, 2, 2, size)).toBe(1)
  })

  it('finds a negative-anchor prop from its on-map cell (#341)', () => {
    expect(propIndexAt([{ object_id: 7, x: -1, y: -1 }], 0, 0, size)).toBe(0)
  })
})

describe('propEntities', () => {
  it('bakes each placed prop into a kind:"prop" object reference', () => {
    expect(propEntities([{ object_id: 7, x: 2, y: 2 }])).toEqual([{ kind: 'prop', object_id: 7, x: 2, y: 2 }])
  })

  it('denormalizes an object\'s walk_mask onto the baked entity (#166), generic to any kind', () => {
    const maskOf = (id: number) => (id === 7 ? ['##', '##'] : undefined)
    expect(propEntities([{ object_id: 7, x: 2, y: 2 }, { object_id: 9, x: 0, y: 0 }], maskOf)).toEqual([
      { kind: 'prop', object_id: 7, x: 2, y: 2, walk_mask: ['##', '##'] },
      // Object 9 carries no mask → no field emitted → blocks nothing.
      { kind: 'prop', object_id: 9, x: 0, y: 0 },
    ])
  })

  it('denormalizes an object\'s edge_mask onto the baked entity (#207), independent of walk_mask', () => {
    const maskOf = (id: number) => (id === 7 ? ['##', '##'] : undefined)
    const edgeMaskOf = (id: number) => (id === 7 ? ['22', '00'] : undefined)
    expect(propEntities([{ object_id: 7, x: 2, y: 2 }, { object_id: 9, x: 0, y: 0 }], maskOf, edgeMaskOf)).toEqual([
      { kind: 'prop', object_id: 7, x: 2, y: 2, walk_mask: ['##', '##'], edge_mask: ['22', '00'] },
      // Object 9 carries neither mask → plain reference.
      { kind: 'prop', object_id: 9, x: 0, y: 0 },
    ])
  })

  it('carries an edge_mask even when the object has no walk_mask', () => {
    const edgeMaskOf = (id: number) => (id === 5 ? ['2'] : undefined)
    expect(propEntities([{ object_id: 5, x: 1, y: 1 }], undefined, edgeMaskOf)).toEqual([
      { kind: 'prop', object_id: 5, x: 1, y: 1, edge_mask: ['2'] },
    ])
  })

  it('denormalizes a building\'s door anchor as door_dx/door_dy (#212), independent of the masks', () => {
    const maskOf = (id: number) => (id === 7 ? ['##', '##'] : undefined)
    const doorOf = (id: number) => (id === 7 ? { dx: 1, dy: 0 } : undefined)
    expect(propEntities([{ object_id: 7, x: 2, y: 2 }, { object_id: 9, x: 0, y: 0 }], maskOf, undefined, doorOf)).toEqual([
      { kind: 'prop', object_id: 7, x: 2, y: 2, walk_mask: ['##', '##'], door_dx: 1, door_dy: 0 },
      // Object 9 carries no door → plain reference (no door fields emitted).
      { kind: 'prop', object_id: 9, x: 0, y: 0 },
    ])
  })

  it('carries a door anchor even when the object has no masks, including offset 0', () => {
    const doorOf = (id: number) => (id === 5 ? { dx: 0, dy: 0 } : undefined)
    expect(propEntities([{ object_id: 5, x: 1, y: 1 }], undefined, undefined, doorOf)).toEqual([
      { kind: 'prop', object_id: 5, x: 1, y: 1, door_dx: 0, door_dy: 0 },
    ])
  })
})

describe('propsFromBaked', () => {
  it('reconstructs placed props from object-reference entities only', () => {
    const entities = [
      { kind: 'prop', object_id: 7, x: 2, y: 2 },
      // Legacy spritesheet-cell prop (seed atrium) — renderable, not editable here.
      { kind: 'prop', tileset: 'sheet', frame: 41, x: 0, y: 0 },
      { kind: 'house', object_id: 3, x: 1, y: 1 }, // not a prop
    ]
    expect(propsFromBaked(entities)).toEqual([{ object_id: 7, x: 2, y: 2 }])
  })
})

describe('propGhost', () => {
  const props = [{ object_id: 7, x: 1, y: 1 }] // 2×2 covering (1..2, 1..2)

  it('gives the selected object footprint at the hovered tile, valid when it fits', () => {
    expect(propGhost({ x: 0, y: 0 }, 7, [], size, bounds)).toEqual({ x: 0, y: 0, w: 2, h: 2, valid: true })
  })

  it('marks the ghost valid when the footprint overflows the edge (#340)', () => {
    // 2 wide at col 3 of 4 overflows right — now valid (matches placeProp).
    expect(propGhost({ x: 3, y: 1 }, 7, [], size, bounds)).toEqual({ x: 3, y: 1, w: 2, h: 2, valid: true })
  })

  it('marks the ghost invalid when no footprint cell lands on the map', () => {
    // Anchor at col 4 (== cols) — the whole 2×2 sits off the right edge.
    expect(propGhost({ x: 4, y: 1 }, 7, [], size, bounds)).toEqual({ x: 4, y: 1, w: 2, h: 2, valid: false })
  })

  it('marks a negative-anchor hover valid while a cell stays on-map (#347)', () => {
    // 2×2 at (-1,-1) keeps (0,0) on-map — a gutter click there may place it.
    expect(propGhost({ x: -1, y: -1 }, 7, [], size, bounds)).toEqual({ x: -1, y: -1, w: 2, h: 2, valid: true })
    // 2×2 at (-2,-2) is entirely off — red ghost, click refused.
    expect(propGhost({ x: -2, y: -2 }, 7, [], size, bounds)).toEqual({ x: -2, y: -2, w: 2, h: 2, valid: false })
  })

  it('in erase mode returns the footprint of the prop under the cursor', () => {
    // A covered (non-anchor) cell resolves to the whole 2×2 that a click removes.
    expect(propGhost({ x: 2, y: 2 }, 'erase', props, size, bounds)).toEqual({ x: 1, y: 1, w: 2, h: 2, valid: true })
  })

  it('in select mode returns the topmost prop under the cursor, null off any', () => {
    const stacked = [...props, { object_id: 9, x: 2, y: 2 }]
    expect(propGhost({ x: 2, y: 2 }, 'select', stacked, size, bounds)).toEqual({ x: 2, y: 2, w: 1, h: 1, valid: true })
    expect(propGhost({ x: 0, y: 0 }, 'select', stacked, size, bounds)).toBeNull()
  })

  it('in erase mode returns null off any prop', () => {
    expect(propGhost({ x: 0, y: 0 }, 'erase', props, size, bounds)).toBeNull()
  })
})

describe('objectIdsFrom', () => {
  it('collects each referenced object id once, any entity kind', () => {
    const entities = [
      { kind: 'prop', object_id: 7, x: 2, y: 2 },
      { kind: 'prop', object_id: 7, x: 5, y: 3 },
      { kind: 'house', object_id: 3, x: 1, y: 1 },
      { kind: 'prop', tileset: 'sheet', frame: 41, x: 0, y: 0 }, // no reference
    ]
    expect(objectIdsFrom(entities)).toEqual([7, 3])
  })
})
