// The town prop producer (ADR-0008, #141). Replaces the townPropPlacement
// characterization golden net: that pinned the pre-refactor placement geometry
// (which cells get a tree, how the flower scatter clusters); this proves the new
// producer — which emits shared-loader draws for the one kernel entity path —
// reproduces exactly that geometry, and stamps it with the depth/anchor policy
// that preserves the town's look. Pure + asset-free (buildTown is hash-seeded,
// planFlowers deterministic), so the baseline is stable.

import { describe, expect, it } from 'vitest'
import { buildTown, planFlowers, type HometownPolicy, type Town } from './town.ts'
import { treeCells, townPropDraws } from './townProps.ts'

// The same fixed six-plot town the golden net used — byte-for-byte reproducible.
const town: Town = buildTown(6)

// A fully-resolved Hometown Policy (#173): one active object per foliage kind.
const POLICY: HometownPolicy = {
  tree: { id: 7, footprint_w: 1, footprint_h: 2 },
  flowerGroup: { id: 3, footprint_w: 2, footprint_h: 2 },
  flowerSingle: { id: 4 },
}

describe('buildTown placed entities (#173)', () => {
  const withPolicy = buildTown(6, undefined, undefined, undefined, undefined, POLICY)

  it('emits one tree entity per boundary T cell, referencing the active tree id', () => {
    const trees = withPolicy.entities.filter((e) => e.object_id === 7)
    expect(trees.every((e) => e.kind === 'prop')).toBe(true)
    expect(trees.map((e) => `${e.x},${e.y}`)).toEqual(
      treeCells(withPolicy).map((c) => `${c.col},${c.row}`),
    )
  })

  it('emits flower-group / flower-single entities matching the policy clustering', () => {
    const { groups, singles } = planFlowers(withPolicy, 2, 2)
    expect(
      withPolicy.entities.filter((e) => e.object_id === 3).map((e) => `${e.x},${e.y}`),
    ).toEqual(groups.map((g) => `${g.x},${g.y}`))
    expect(
      withPolicy.entities.filter((e) => e.object_id === 4).map((e) => `${e.x},${e.y}`),
    ).toEqual(singles.map((s) => `${s.x},${s.y}`))
  })

  it('an absent role places nothing; no policy places nothing', () => {
    expect(buildTown(6).entities).toEqual([])
    const treeless = buildTown(6, undefined, undefined, undefined, undefined, {
      ...POLICY,
      tree: null,
    })
    expect(treeless.entities.some((e) => e.object_id === 7)).toBe(false)
  })

  it('with no active group, every scatter cell falls to the single', () => {
    const singlesOnly = buildTown(6, undefined, undefined, undefined, undefined, {
      tree: null,
      flowerGroup: null,
      flowerSingle: { id: 4 },
    })
    const { groups, singles } = planFlowers(town, 1, 1)
    expect(singlesOnly.entities.map((e) => `${e.x},${e.y}`)).toEqual(
      [...groups, ...singles].map((c) => `${c.x},${c.y}`),
    )
    expect(singlesOnly.entities.every((e) => e.object_id === 4)).toBe(true)
  })
})

describe('townProps producer (#141)', () => {
  const withPolicy = buildTown(6, undefined, undefined, undefined, undefined, POLICY)

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

  it('draws one bottom-anchored, y-sorted tree per tree entity', () => {
    const { trees } = townPropDraws(withPolicy.entities, POLICY)
    // Same count + order as the T cells, each stamped exactly as the pre-#141
    // addTallProps did: origin (0.5, 1) at cell centre-bottom, depth banded by
    // the base row, sized to the object's authored footprint.
    expect(trees).toEqual(
      treeCells(withPolicy).map(({ col, row }) => ({
        key: 'obj.7',
        x: col + 0.5,
        y: row + 1,
        w: 1,
        h: 2,
        depth: (row + 1) * 10 - 1,
        originX: 0.5,
        originY: 1,
      })),
    )
  })

  it('group entities stamp the full footprint; singles stamp 1×1', () => {
    const { flowers } = townPropDraws(withPolicy.entities, POLICY)
    const { groups, singles } = planFlowers(withPolicy, 2, 2)
    const groupDraws = flowers.filter((f) => f.key === 'obj.3')
    const singleDraws = flowers.filter((f) => f.key === 'obj.4')
    expect(flowers.every((f) => f.depth === 0.35)).toBe(true)
    expect(groupDraws.map((f) => `${f.x},${f.y}:${f.w}x${f.h}`)).toEqual(
      groups.map((g) => `${g.x},${g.y}:2x2`),
    )
    expect(singleDraws.map((f) => `${f.x},${f.y}:${f.w}x${f.h}`)).toEqual(
      singles.map((s) => `${s.x},${s.y}:1x1`),
    )
  })

  it('no entities draws nothing', () => {
    expect(townPropDraws([], POLICY)).toEqual({ trees: [], flowers: [] })
  })
})
