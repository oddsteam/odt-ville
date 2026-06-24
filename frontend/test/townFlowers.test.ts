import { describe, expect, it } from 'vitest'

import { buildTown, flowerAt, typeForTileChar } from '../src/game/town.ts'

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
