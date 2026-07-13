// Pins the prop-placement model (#139, ADR-0008): props are references to
// saved tile objects placed at their authored footprint — a 2×2 object claims
// 4 grid cells (occupancy, overlap replacement, edge clamping, erase from any
// covered cell) — baked to object_id entities and reconstructed on re-open.

import { describe, expect, it } from 'vitest'
import { placeProp, erasePropAt, coveredCells, propEntities, propsFromBaked, objectIdsFrom, propGhost } from './props.ts'
import type { PlacedProp } from './props.ts'

// Object 7 is 2×2, object 9 is 1×1, object 5 is fractional (1.4×1.8 ≈ 2×2 cells).
const size = (id: number) => (id === 7 ? { w: 2, h: 2 } : id === 5 ? { w: 1.4, h: 1.8 } : { w: 1, h: 1 })
const bounds = { cols: 4, rows: 4 }
const place = (props: readonly PlacedProp[], p: PlacedProp) => placeProp(props, p, size, bounds)

describe('placeProp', () => {
  it('replaces any prop whose footprint overlaps the new one', () => {
    const one = place([], { object_id: 7, x: 1, y: 1 }) // covers (1..2, 1..2)
    expect(one).toHaveLength(1)

    // A 1×1 stamped on a covered (non-anchor) cell replaces the 2×2 under it.
    const restamped = place(one, { object_id: 9, x: 2, y: 2 })
    expect(restamped).toEqual([{ object_id: 9, x: 2, y: 2 }])

    // A non-overlapping cell is a second prop.
    expect(place(restamped, { object_id: 9, x: 0, y: 0 })).toHaveLength(2)
  })

  it('rejects a placement whose footprint would hang off the map', () => {
    expect(place([], { object_id: 7, x: 3, y: 1 })).toEqual([]) // 2 wide at col 3 of 4
    expect(place([], { object_id: 7, x: 1, y: 3 })).toEqual([]) // 2 tall at row 3 of 4
  })

  it('rounds a fractional footprint up to whole cells', () => {
    // 1.4×1.8 occupies 2×2 cells, so anchor (3,3) exceeds a 4×4 map.
    expect(place([], { object_id: 5, x: 3, y: 3 })).toEqual([])
    const ok = place([], { object_id: 5, x: 2, y: 2 })
    expect(ok).toHaveLength(1)
  })
})

describe('erasePropAt', () => {
  it('removes the prop covering a cell, even off its anchor', () => {
    const two = place(place([], { object_id: 7, x: 1, y: 1 }), { object_id: 9, x: 0, y: 0 })
    const after = erasePropAt(two, 2, 2, size) // covered corner of the 2×2
    expect(after).toEqual([{ object_id: 9, x: 0, y: 0 }])
    expect(erasePropAt(two, 3, 3, size)).toBe(two) // no-op off any prop
  })
})

describe('coveredCells', () => {
  it('lists every cell each footprint occupies', () => {
    const cells = coveredCells([{ object_id: 7, x: 1, y: 1 }], size)
    expect(cells).toEqual(new Set(['1,1', '2,1', '1,2', '2,2']))
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

  it('marks the ghost invalid when the footprint would hang off the map', () => {
    // 2 wide at col 3 of 4 hangs off — refused (matches placeProp).
    expect(propGhost({ x: 3, y: 1 }, 7, [], size, bounds)).toEqual({ x: 3, y: 1, w: 2, h: 2, valid: false })
  })

  it('in erase mode returns the footprint of the prop under the cursor', () => {
    // A covered (non-anchor) cell resolves to the whole 2×2 that a click removes.
    expect(propGhost({ x: 2, y: 2 }, 'erase', props, size, bounds)).toEqual({ x: 1, y: 1, w: 2, h: 2, valid: true })
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
