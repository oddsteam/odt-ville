// The town prop producer (ADR-0008, #141). Replaces the townPropPlacement
// characterization golden net: that pinned the pre-refactor placement geometry
// (which cells get a tree, how the flower scatter clusters); this proves the new
// producer — which emits shared-loader draws for the one kernel entity path —
// reproduces exactly that geometry, and stamps it with the depth/anchor policy
// that preserves the town's look. Pure + asset-free (buildTown is hash-seeded,
// planFlowers deterministic), so the baseline is stable.

import { describe, expect, it } from 'vitest'
import { buildTown, planFlowers, type Town } from './town.ts'
import { treeCells, townPropDraws, type TownPropArt } from './townProps.ts'

// The same fixed six-plot town the golden net used — byte-for-byte reproducible.
const town: Town = buildTown(6)

// A tree with an admin-object footprint (fractional, like the bundled 1.4×1.8).
const TREE = { key: 'obj.7', w: 1.4, h: 1.8 }

describe('townProps producer (#141)', () => {
  it('treeCells is every boundary T cell in row-major order', () => {
    const cells = treeCells(town).map((c) => `${c.col},${c.row}`)
    // Spot-check the shape the golden net pinned: the full top row, the side
    // rails, and the entrance gap in the bottom row (col 12 is the ':' gate).
    expect(cells.slice(0, 24)).toEqual(
      Array.from({ length: 24 }, (_, x) => `${x},0`),
    )
    expect(cells).toContain('0,13')
    expect(cells).toContain('23,13')
    expect(cells).not.toContain('12,26') // entrance stem, not a tree
    // Top row (24) + side rails on rows 1..25 (2×25) + bottom row less the gate
    // (23) = 97 boundary cells.
    expect(cells).toHaveLength(97)
  })

  it('emits one bottom-anchored, y-sorted tree draw per T cell', () => {
    const { trees } = townPropDraws(town, { tree: TREE, flowerGroup: null, flowerSingle: null })
    // Same count + order as the T cells, each stamped exactly as the pre-#141
    // addTallProps did: origin (0.5, 1) at cell centre-bottom, depth banded by
    // the base row, sized to the resolved footprint.
    expect(trees).toEqual(
      treeCells(town).map(({ col, row }) => ({
        key: 'obj.7',
        x: col + 0.5,
        y: row + 1,
        w: 1.4,
        h: 1.8,
        depth: (row + 1) * 10 - 1,
        originX: 0.5,
        originY: 1,
      })),
    )
  })

  it('no tree art places no trees', () => {
    const { trees } = townPropDraws(town, { tree: null, flowerGroup: null, flowerSingle: null })
    expect(trees).toEqual([])
  })

  it('flowers cluster into 1×1 groups per cell with the default footprint', () => {
    const art: TownPropArt = {
      tree: null,
      flowerGroup: { key: 'tile.flower', w: 1, h: 1 },
      flowerSingle: { key: 'tile.flower' },
    }
    const { flowers } = townPropDraws(town, art)
    const { groups, singles } = planFlowers(town, 1, 1)
    // A 1×1 group degenerates to one stamp per '*'; no leftovers.
    expect(singles).toHaveLength(0)
    expect(flowers).toHaveLength(groups.length)
    expect(flowers.every((f) => f.depth === 0.35 && f.w === 1 && f.h === 1)).toBe(true)
    expect(flowers.map((f) => `${f.x},${f.y}`)).toEqual(groups.map((g) => `${g.x},${g.y}`))
  })

  it('a 2×2 admin group tiles clusters and 1×1 singles fill the rest', () => {
    const art: TownPropArt = {
      tree: null,
      flowerGroup: { key: 'obj.3', w: 2, h: 2 },
      flowerSingle: { key: 'obj.4' },
    }
    const { flowers } = townPropDraws(town, art)
    const { groups, singles } = planFlowers(town, 2, 2)
    const groupDraws = flowers.filter((f) => f.key === 'obj.3')
    const singleDraws = flowers.filter((f) => f.key === 'obj.4')
    // Groups stamp the full 2×2 footprint; singles always fall back to 1×1.
    expect(groupDraws.map((f) => `${f.x},${f.y}:${f.w}x${f.h}`)).toEqual(
      groups.map((g) => `${g.x},${g.y}:2x2`),
    )
    expect(singleDraws.map((f) => `${f.x},${f.y}:${f.w}x${f.h}`)).toEqual(
      singles.map((s) => `${s.x},${s.y}:1x1`),
    )
  })
})
