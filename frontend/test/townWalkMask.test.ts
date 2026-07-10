import { describe, expect, it } from 'vitest'

import { buildTown, isWalkable, walkMaskFor } from '../src/game/town.ts'
import { validateWalkMask, walkMaskConnected } from '../src/game/walkMask.ts'

// The authored walk mask (#32) is a row-major grid the size of the building
// footprint: '#' = solid, '.' = walkable (porch/path). The door point is the
// existing door_dx/door_dy cell (#29), always walkable. Save is rejected unless
// a door is defined, at least one walkable tile is painted, and the door
// connects to a footprint-edge cell via walkable tiles (so it's reachable from
// outside). All validation is pure and Node-runnable.

describe('walkMaskFor', () => {
  it('returns the authored mask', () => {
    expect(walkMaskFor({ walk_mask: ['###', '#.#', '#.#', '#.#'] })).toEqual([
      '###',
      '#.#',
      '#.#',
      '#.#',
    ])
  })

  it('is undefined when no mask was authored', () => {
    expect(walkMaskFor(null)).toBeUndefined()
    expect(walkMaskFor({ walk_mask: null })).toBeUndefined()
    expect(walkMaskFor({ walk_mask: [] })).toBeUndefined()
  })
})

describe('walkMaskConnected', () => {
  // 3x4 footprint. Door bottom-centre {1,3}, a column of '.' leading up.
  const w = 3
  const h = 4
  const path = ['###', '#.#', '#.#', '#.#']

  it('is true when a walkable path reaches a footprint edge', () => {
    // door at {1,3} -> edge cell (dy === h-1) reached immediately.
    expect(walkMaskConnected(path, w, h, { dx: 1, dy: 3 })).toBe(true)
  })

  it('is true for an interior door connected to the edge by a porch', () => {
    // door at {1,1} interior; the '.' column connects down to the bottom edge.
    expect(walkMaskConnected(path, w, h, { dx: 1, dy: 1 })).toBe(true)
  })

  it('is false for an interior door walled off from every edge', () => {
    // a single interior '.' island at {1,1}, no path to any edge.
    const island = ['###', '#.#', '###', '###']
    expect(walkMaskConnected(island, w, h, { dx: 1, dy: 1 })).toBe(false)
  })
})

describe('validateWalkMask', () => {
  const w = 3
  const h = 4
  const path = ['###', '#.#', '#.#', '#.#']

  it('accepts a door + walkable tiles that connect to the edge', () => {
    expect(validateWalkMask(path, w, h, { dx: 1, dy: 3 }).ok).toBe(true)
  })

  it('rejects a missing door', () => {
    const r = validateWalkMask(path, w, h, null)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('no-door')
  })

  it('rejects a mask with no walkable tile', () => {
    const r = validateWalkMask(['###', '###', '###', '###'], w, h, { dx: 1, dy: 3 })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('no-walkable')
  })

  it('rejects a door that cannot reach an edge', () => {
    const island = ['###', '#.#', '###', '###']
    const r = validateWalkMask(island, w, h, { dx: 1, dy: 1 })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('unreachable')
  })
})

describe('buildTown walk mask stamping', () => {
  it('stamps a dimension-matching mask onto every plot', () => {
    const mask = ['###', '#.#', '#.#', '#.#']
    const { plots } = buildTown(3, { dx: 1, dy: 3 }, { w: 3, h: 4 }, mask)
    for (const p of plots) expect(p.mask).toEqual(mask)
  })

  it('ignores a mask whose dimensions do not match the footprint', () => {
    const mask = ['##', '##'] // 2x2, footprint is 3x4
    const { plots } = buildTown(1, { dx: 1, dy: 3 }, { w: 3, h: 4 }, mask)
    expect(plots[0].mask).toBeUndefined()
  })

  it('keeps an authored interior door the walk mask makes reachable', () => {
    // Door at {1,1} is interior, but a '.' column connects it down to the
    // bottom edge — so the #30 snap-to-default must NOT fire (it would for an
    // unmasked building).
    const mask = ['###', '#.#', '#.#', '#.#']
    const { plots } = buildTown(1, { dx: 1, dy: 1 }, { w: 3, h: 4 }, mask)
    const p = plots[0]
    expect(p.doorCol).toBe(p.col + 1)
    expect(p.doorRow).toBe(p.row + 1)
  })

  it('snaps an interior door the walk mask leaves unreachable', () => {
    // Door at {1,1} with an island '.' that reaches no edge -> snap to default.
    const mask = ['###', '#.#', '###', '###']
    const { plots } = buildTown(1, { dx: 1, dy: 1 }, { w: 3, h: 4 }, mask)
    const p = plots[0]
    expect(p.doorCol).toBe(p.col + 1) // default dx floor((3-1)/2)
    expect(p.doorRow).toBe(p.row + 3) // default dy h-1
  })
})

describe('isWalkable with a walk mask', () => {
  // 5x5 grass grid. One 3x4 building at origin with a porch column.
  const town = { cols: 5, rows: 5, map: ['.....', '.....', '.....', '.....', '.....'] }
  const mask = ['###', '#.#', '#.#', '#.#']
  const buildings = [
    { col: 0, row: 0, w: 3, h: 4, doorCol: 1, doorRow: 3, mask },
  ]
  const none = new Set<string>()

  it('lets the player onto a masked walkable interior cell', () => {
    expect(isWalkable(town, buildings, none, 1, 1)).toBe(true)
    expect(isWalkable(town, buildings, none, 1, 2)).toBe(true)
  })

  it('still blocks a solid footprint cell', () => {
    expect(isWalkable(town, buildings, none, 0, 0)).toBe(false)
    expect(isWalkable(town, buildings, none, 2, 1)).toBe(false)
  })

  it('still lets the player onto the door cell', () => {
    expect(isWalkable(town, buildings, none, 1, 3)).toBe(true)
  })
})
