import { describe, expect, it } from 'vitest'

import { buildTown, tileChar, typeForTileChar, type Footprint } from '../src/game/town.ts'

// Mixed-footprint towns (#31). #30 gave every plot the ONE active building's
// footprint, so layout stayed uniform-grid arithmetic. With per-community
// building assignment (#292) two plots in the same town can carry different
// sizes, so `buildTown` takes a per-plot footprint list and packs it: plots run
// left→right at their own widths, wrap every PER_ROW, and sit bottom-aligned in
// their band so each door still opens onto the street below.
const HOUSE: Footprint = { w: 3, h: 4 }
const TOWNHALL: Footprint = { w: 6, h: 6 }
const SHOP: Footprint = { w: 4, h: 5 }

describe('buildTown mixed footprints (#31)', () => {
  it('lays plots left→right at their own widths with a 1-cell gap', () => {
    const { plots } = buildTown(3, undefined, [TOWNHALL, HOUSE, SHOP])
    expect(plots.map((p) => [p.col, p.w])).toEqual([
      [2, 6],
      [9, 3], // 2 + 6 + 1
      [13, 4], // 9 + 3 + 1
    ])
  })

  it('bottom-aligns a band so every door opens onto the same street row', () => {
    const town = buildTown(3, undefined, [TOWNHALL, HOUSE, SHOP])
    const bottoms = town.plots.map((p) => p.row + p.h)
    expect(new Set(bottoms).size).toBe(1)
    // The row directly below the band is the street path.
    expect(typeForTileChar(tileChar(town, town.plots[0].doorCol, bottoms[0]))).toBe('road')
    for (const p of town.plots) expect(p.doorRow).toBe(p.row + p.h - 1)
  })

  it('defaults each door to bottom-centre of ITS own footprint', () => {
    const { plots } = buildTown(2, undefined, [TOWNHALL, HOUSE])
    expect([plots[0].doorCol - plots[0].col, plots[0].doorRow - plots[0].row]).toEqual([2, 5])
    expect([plots[1].doorCol - plots[1].col, plots[1].doorRow - plots[1].row]).toEqual([1, 3])
  })

  it('is identical to the uniform grid when every plot shares one footprint', () => {
    const uniform = buildTown(7, undefined, SHOP)
    const listed = buildTown(7, undefined, Array(7).fill(SHOP))
    expect(listed).toEqual(uniform)
  })

  it('keeps plots inside the map and never overlapping', () => {
    const sizes = [TOWNHALL, HOUSE, SHOP, { w: 20, h: 20 }, { w: 14, h: 19 }]
    for (let count = 1; count <= 12; count++) {
      const town = buildTown(count, undefined, Array.from({ length: count }, (_, i) => sizes[i % sizes.length]))
      const taken = new Set<string>()
      for (const p of town.plots) {
        expect(p.col).toBeGreaterThan(0)
        expect(p.col + p.w).toBeLessThan(town.cols)
        expect(p.row).toBeGreaterThan(0)
        expect(p.row + p.h).toBeLessThan(town.rows)
        for (let y = p.row; y < p.row + p.h; y++)
          for (let x = p.col; x < p.col + p.w; x++) {
            expect(taken.has(`${x},${y}`), `overlap at ${x},${y} count=${count}`).toBe(false)
            taken.add(`${x},${y}`)
          }
      }
    }
  })

  it('produces no one-tile-wide autotiled (grass/dirt) strips', () => {
    const autotiled = new Set(['grass', 'dirt'])
    const sizes = [HOUSE, TOWNHALL, SHOP, { w: 20, h: 4 }, { w: 3, h: 20 }]
    for (let count = 1; count <= 12; count++) {
      const town = buildTown(count, undefined, Array.from({ length: count }, (_, i) => sizes[i % sizes.length]))
      for (let y = 0; y < town.rows; y++) {
        for (let x = 0; x < town.cols; x++) {
          const terrain = typeForTileChar(town.map[y][x])
          if (!terrain || !autotiled.has(terrain)) continue
          const n = typeForTileChar(tileChar(town, x, y - 1))
          const s = typeForTileChar(tileChar(town, x, y + 1))
          const e = typeForTileChar(tileChar(town, x + 1, y))
          const w = typeForTileChar(tileChar(town, x - 1, y))
          const vertical = n && s && n !== terrain && s !== terrain
          const horizontal = e && w && e !== terrain && w !== terrain
          expect(vertical || horizontal, `count=${count} (${x},${y})`).toBe(false)
        }
      }
    }
  })
})
