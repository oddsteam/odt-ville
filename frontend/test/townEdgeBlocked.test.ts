import { describe, expect, it } from 'vitest'

import { buildTown, edgeBlocked, edgeMaskFor } from '../src/game/town.ts'

// #53: a building whose footprint cell (0,0) marks its SOUTH edge impassable
// (hex bit S=4). World coords == local here (col/row 0). Stepping between (0,0)
// and (0,1) crosses that authored border.
const south = [{ col: 0, row: 0, w: 2, h: 2, doorCol: 0, doorRow: 1, edges: ['40', '00'] }]

describe('edgeBlocked', () => {
  it('blocks stepping down across an authored south border', () => {
    expect(edgeBlocked(south, 0, 0, 0, 1)).toBe(true)
  })

  it('is symmetric — blocks stepping back up across the same border', () => {
    expect(edgeBlocked(south, 0, 1, 0, 0)).toBe(true)
  })

  it('blocks the shared border when only the neighbour cell marks its side', () => {
    // cell (0,1) marks NORTH (bit N=1) — the same shared border as (0,0)'s south.
    const north = [{ col: 0, row: 0, w: 2, h: 2, doorCol: 0, doorRow: 1, edges: ['00', '10'] }]
    expect(edgeBlocked(north, 0, 0, 0, 1)).toBe(true)
  })

  it('allows an unmarked border between two cells', () => {
    expect(edgeBlocked(south, 0, 0, 1, 0)).toBe(false) // east step, nothing marked
  })

  it('never blocks a building with no edge mask (backward compatible)', () => {
    const plain = [{ col: 0, row: 0, w: 2, h: 2, doorCol: 0, doorRow: 1 }]
    expect(edgeBlocked(plain, 0, 0, 0, 1)).toBe(false)
  })
})

describe('edgeMaskFor', () => {
  it('returns the authored edge mask', () => {
    expect(edgeMaskFor({ edge_mask: ['40', '00'] })).toEqual(['40', '00'])
  })

  it('is undefined when none authored', () => {
    expect(edgeMaskFor(null)).toBeUndefined()
    expect(edgeMaskFor({ edge_mask: null })).toBeUndefined()
    expect(edgeMaskFor({ edge_mask: [] })).toBeUndefined()
  })
})

describe('buildTown edge mask stamping', () => {
  const mask = ['###', '#.#', '#.#', '#.#']

  it('stamps a dimension-matching edge mask onto every plot', () => {
    const edges = ['000', '040', '000', '000']
    const { plots } = buildTown(3, { dx: 1, dy: 3 }, { w: 3, h: 4 }, mask, edges)
    for (const p of plots) expect(p.edges).toEqual(edges)
  })

  it('ignores an edge mask whose dimensions do not match the footprint', () => {
    const edges = ['00', '00'] // 2x2, footprint is 3x4
    const { plots } = buildTown(1, { dx: 1, dy: 3 }, { w: 3, h: 4 }, mask, edges)
    expect(plots[0].edges).toBeUndefined()
  })
})
