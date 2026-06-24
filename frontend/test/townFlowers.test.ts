import { describe, expect, it } from 'vitest'

import { buildTown, flowerAt, planFlowers, typeForTileChar } from '../src/game/town.ts'
import type { TileGrid } from '../src/game/town.ts'

// Hand-built grid from ASCII rows so the '*' pattern under test is explicit.
const grid = (rows: string[]): TileGrid => ({ rows: rows.length, cols: rows[0].length, map: rows })

// Expand a layout into the set of cells each kind claims, for coverage assertions.
const groupCells = (g: { x: number; y: number; w: number; h: number }) => {
  const out: string[] = []
  for (let dy = 0; dy < g.h; dy++) for (let dx = 0; dx < g.w; dx++) out.push(`${g.x + dx},${g.y + dy}`)
  return out
}

function sample(W = 60, H = 60) {
  const flowered = new Set<string>()
  let total = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      total++
      if (flowerAt(x, y)) flowered.add(`${x},${y}`)
    }
  }
  return { flowered, total }
}

describe('flowerAt', () => {
  it('places a sane density — some flowers, not a field of them', () => {
    const { flowered, total } = sample()
    const rate = flowered.size / total
    expect(rate).toBeGreaterThan(0.02)
    expect(rate).toBeLessThan(0.4)
  })

  it('clusters — a flowered tile’s neighbours flower well above the global rate', () => {
    const { flowered, total } = sample()
    const global = flowered.size / total
    let neighTotal = 0
    let neighFlower = 0
    for (const cell of flowered) {
      const [x, y] = cell.split(',').map(Number)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        neighTotal++
        if (flowered.has(`${x + dx},${y + dy}`)) neighFlower++
      }
    }
    const conditional = neighFlower / neighTotal
    expect(conditional).toBeGreaterThan(global * 1.5)
  })

  it('is deterministic across runs (no Math.random)', () => {
    expect([...sample().flowered].sort()).toEqual([...sample().flowered].sort())
  })

  it('buildTown scatters flowers only onto interior grass — never road/field/boundary', () => {
    const town = buildTown(12)
    const stars: Array<[number, number]> = []
    for (let y = 0; y < town.rows; y++) {
      for (let x = 0; x < town.cols; x++) {
        if (town.map[y][x] === '*') stars.push([x, y])
      }
    }
    expect(stars.length).toBeGreaterThan(0)
    for (const [x, y] of stars) {
      // interior only — a flower must never punch a walkable hole in the tree ring
      expect(x > 1 && x < town.cols - 1 && y > 0 && y < town.rows - 1).toBe(true)
      expect(typeForTileChar(town.map[y][x])).toBe('grass')
    }
  })
})

describe('planFlowers', () => {
  const stars = (town: TileGrid) => {
    const out: string[] = []
    for (let y = 0; y < town.rows; y++)
      for (let x = 0; x < town.cols; x++) if (town.map[y][x] === '*') out.push(`${x},${y}`)
    return out
  }

  it('1x1 footprint: every flower is its own group, no singles (backward compatible)', () => {
    const town = grid(['.*.', '**.', '.*.'])
    const { groups, singles } = planFlowers(town, 1, 1)
    expect(singles).toEqual([])
    expect(groups.every((g) => g.w === 1 && g.h === 1)).toBe(true)
    expect(new Set(groups.map((g) => `${g.x},${g.y}`))).toEqual(new Set(stars(town)))
  })

  it('2x2 footprint: stamps the group on the fitting block, leftover cells fall to singles', () => {
    // 3x3 star block — one 2x2 group anchors top-left, the L-shaped remainder is singles.
    const town = grid(['***', '***', '***'])
    const { groups, singles } = planFlowers(town, 2, 2)
    expect(groups).toEqual([{ x: 0, y: 0, w: 2, h: 2 }])
    expect(new Set(singles.map((s) => `${s.x},${s.y}`))).toEqual(
      new Set(['2,0', '2,1', '0,2', '1,2', '2,2']),
    )
  })

  it('never clips a group across a non-flower cell (no half-groups)', () => {
    // A 2x2 only fits at the solid corner; the ragged arm stays single.
    const town = grid(['**.', '**.', '.**'])
    const { groups } = planFlowers(town, 2, 2)
    expect(groups).toEqual([{ x: 0, y: 0, w: 2, h: 2 }])
    for (const g of groups)
      for (const cell of groupCells(g)) {
        const [x, y] = cell.split(',').map(Number)
        expect(town.map[y][x]).toBe('*')
      }
  })

  it('partitions every flower cell exactly once across groups and singles', () => {
    const town = grid(['.***.', '*****', '.***.', '*...*'])
    const { groups, singles } = planFlowers(town, 2, 2)
    const claimed = [...groups.flatMap(groupCells), ...singles.map((s) => `${s.x},${s.y}`)]
    expect(claimed.length).toBe(new Set(claimed).size) // disjoint — no overlap mess
    expect(new Set(claimed)).toEqual(new Set(stars(town))) // complete — every flower placed
  })

  it('is deterministic', () => {
    const town = grid(['***', '***', '***'])
    expect(planFlowers(town, 2, 2)).toEqual(planFlowers(town, 2, 2))
  })
})
