// REGRESSION GUARD — town foliage placement (#141, ADR-0008).
//
// Origin: this was the golden net pinned *before* #141, which folds the
// hometown's bespoke prop plumbing (`_treeObject` /
// `_flowerGroup` / `_flowerSingle`) into the ADR-0008 shared entity loader: the
// town producer will emit `{kind:"prop", object_id, x, y}` entities at
// generation time and rendering goes through the same kernel loader the
// authored map uses. That refactor is behaviour-preserving — the hometown must
// render exactly as before.
//
// The town render path has no other test coverage, so this pins the *placement
// geometry* the refactor must reproduce: which tiles get a tree, and how the
// flower scatter clusters into groups + singles, for a fixed deterministic
// town. Both functions below are pure and asset-free (buildTown is a hash-seeded
// generator; planFlowers is deterministic), so the baseline is stable.
//
// Repointed after #141 landed: the town now emits foliage through townProps.ts
// (`townPropDraws`) + the shared entityLoader. This net now verifies that the
// new path lands trees/flowers on exactly the cells (and at the anchor/depth)
// pinned here from the pre-#141 behaviour — an independent oracle written before
// the refactor. Keep it as a regression guard while #99 (fg_mask) and #90
// (Houses on this same reference shape) touch the convergence; discard once
// townProps.test.ts is trusted to cover it.

import { describe, expect, it } from 'vitest'
import { buildTown, type Town } from './town.ts'
import { planFlowers } from './town.ts'
import { townPropDraws } from './townProps.ts'

// A fixed six-plot town (two building rows). buildTown takes only a plot count
// here; every other input is defaulted, so this is byte-for-byte reproducible.
const town: Town = buildTown(6)

// Every 'T' cell in row-major order — the ground truth the tree pass stamps.
// tallPropsFor early-returns [] when the bundled tree art glob doesn't resolve
// (as in a bare test env), so we derive the placement geometry straight from the
// grid: this is what any producer, bespoke or shared-loader, must reproduce.
function treeCells(t: Town): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = []
  for (let y = 0; y < t.rows; y++) {
    for (let x = 0; x < t.cols; x++) {
      if (t.map[y][x] === 'T') out.push({ col: x, row: y })
    }
  }
  return out
}

describe('town prop placement (regression guard)', () => {
  it('the fixture town has stable dimensions', () => {
    expect({ cols: town.cols, rows: town.rows }).toMatchInlineSnapshot(`
      {
        "cols": 24,
        "rows": 27,
      }
    `)
  })

  it('trees stamp every boundary T cell (row-major)', () => {
    // Serialize compactly so the golden is reviewable as "x,y" cells.
    const cells = treeCells(town).map((c) => `${c.col},${c.row}`)
    expect(cells).toMatchInlineSnapshot(`
      [
        "0,0",
        "1,0",
        "2,0",
        "3,0",
        "4,0",
        "5,0",
        "6,0",
        "7,0",
        "8,0",
        "9,0",
        "10,0",
        "11,0",
        "12,0",
        "13,0",
        "14,0",
        "15,0",
        "16,0",
        "17,0",
        "18,0",
        "19,0",
        "20,0",
        "21,0",
        "22,0",
        "23,0",
        "0,1",
        "23,1",
        "0,2",
        "23,2",
        "0,3",
        "23,3",
        "0,4",
        "23,4",
        "0,5",
        "23,5",
        "0,6",
        "23,6",
        "0,7",
        "23,7",
        "0,8",
        "23,8",
        "0,9",
        "23,9",
        "0,10",
        "23,10",
        "0,11",
        "23,11",
        "0,12",
        "23,12",
        "0,13",
        "23,13",
        "0,14",
        "23,14",
        "0,15",
        "23,15",
        "0,16",
        "23,16",
        "0,17",
        "23,17",
        "0,18",
        "23,18",
        "0,19",
        "23,19",
        "0,20",
        "23,20",
        "0,21",
        "23,21",
        "0,22",
        "23,22",
        "0,23",
        "23,23",
        "0,24",
        "23,24",
        "0,25",
        "23,25",
        "0,26",
        "1,26",
        "2,26",
        "3,26",
        "4,26",
        "5,26",
        "6,26",
        "7,26",
        "8,26",
        "9,26",
        "10,26",
        "11,26",
        "13,26",
        "14,26",
        "15,26",
        "16,26",
        "17,26",
        "18,26",
        "19,26",
        "20,26",
        "21,26",
        "22,26",
        "23,26",
      ]
    `)
  })

  it('townPropDraws emits one tree draw per T cell at the pre-#141 anchor/depth', () => {
    // Post-#141 the shared-loader path replaces addTallProps. It must reproduce
    // the old draw exactly: one bottom-anchored (origin 0.5,1), y-sorted
    // (depth (row+1)*10-1) tree per T cell. Derive each draw back to its (col,
    // row) and compare against the pinned tree geometry — this is the
    // independent oracle that the new entity path didn't move the trees.
    const { trees } = townPropDraws(town, {
      tree: { key: 'prop.tree', w: 1.4, h: 1.8 },
      flowerGroup: null,
      flowerSingle: null,
    })
    const placed = trees.map((d) => ({ col: d.x - 0.5, row: d.y - 1, ox: d.originX, oy: d.originY, depth: d.depth }))
    const expected = treeCells(town).map((c) => ({
      col: c.col,
      row: c.row,
      ox: 0.5,
      oy: 1,
      depth: (c.row + 1) * 10 - 1,
    }))
    expect(placed).toEqual(expected)
  })

  it('townPropDraws flower draws land on the pinned scatter cells (1x1 default)', () => {
    // The new path routes flowers through the same planFlowers the snapshots
    // pin; assert the emitted draws' cells match planFlowers so the shared
    // loader is verified end-to-end, not just the underlying scatter.
    const { flowers } = townPropDraws(town, {
      tree: null,
      flowerGroup: { key: 'tile.flower', w: 1, h: 1 },
      flowerSingle: { key: 'tile.flower' },
    })
    const drawCells = flowers.map((d) => `${d.x},${d.y}`)
    const layout = planFlowers(town, 1, 1)
    const expected = [...layout.groups, ...layout.singles].map((c) => `${c.x},${c.y}`)
    expect(drawCells).toEqual(expected)
  })

  it('flower scatter clusters as groups + singles — 1x1 default footprint', () => {
    // The default (no admin flower-group art) footprint: 1x1, so every '*'
    // becomes a single group per cell (planFlowers degenerates to one-per-cell).
    const layout = planFlowers(town, 1, 1)
    expect({
      groups: layout.groups.length,
      singles: layout.singles.length,
      cells: [...layout.groups, ...layout.singles].map((c) => `${c.x},${c.y}`),
    }).toMatchInlineSnapshot(`
      {
        "cells": [
          "2,1",
          "3,1",
          "4,1",
          "5,1",
          "15,1",
          "16,1",
          "17,1",
          "18,1",
          "21,1",
          "22,1",
          "3,2",
          "4,2",
          "15,2",
          "16,2",
          "17,2",
          "18,2",
          "21,2",
          "22,2",
          "22,8",
          "11,15",
          "13,15",
          "16,15",
          "18,15",
          "19,15",
          "20,15",
          "21,15",
          "9,16",
          "10,16",
          "11,16",
          "13,16",
          "14,16",
          "18,16",
          "19,16",
          "20,16",
          "21,16",
          "2,23",
          "3,23",
          "22,23",
          "2,24",
          "3,24",
          "4,24",
          "5,24",
          "15,24",
          "16,24",
          "17,24",
          "18,24",
          "19,24",
          "20,24",
          "21,24",
          "22,24",
          "2,25",
          "3,25",
          "4,25",
          "5,25",
          "14,25",
          "15,25",
          "16,25",
          "17,25",
          "18,25",
          "19,25",
          "20,25",
          "21,25",
          "22,25",
        ],
        "groups": 63,
        "singles": 0,
      }
    `)
  })

  it('flower scatter clusters as groups + singles — 2x2 admin group footprint', () => {
    // A multi-tile flower-group object tiles across contiguous '*' clusters and
    // leaves patch edges / lone cells as 1x1 singles (#27). This locks the
    // clustering the shared loader must reproduce for a footprinted flower prop.
    const layout = planFlowers(town, 2, 2)
    expect({
      groups: layout.groups.map((g) => `${g.x},${g.y}:${g.w}x${g.h}`),
      singles: layout.singles.map((s) => `${s.x},${s.y}`),
    }).toMatchInlineSnapshot(`
      {
        "groups": [
          "3,1:2x2",
          "15,1:2x2",
          "17,1:2x2",
          "21,1:2x2",
          "18,15:2x2",
          "20,15:2x2",
          "2,23:2x2",
          "4,24:2x2",
          "15,24:2x2",
          "17,24:2x2",
          "19,24:2x2",
          "21,24:2x2",
        ],
        "singles": [
          "2,1",
          "5,1",
          "22,8",
          "11,15",
          "13,15",
          "16,15",
          "9,16",
          "10,16",
          "11,16",
          "13,16",
          "14,16",
          "22,23",
          "2,25",
          "3,25",
          "14,25",
        ],
      }
    `)
  })
})
