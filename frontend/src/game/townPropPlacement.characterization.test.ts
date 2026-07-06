// CHARACTERIZATION / GOLDEN NET — remove after #141.
//
// #141 folds the hometown's bespoke prop plumbing (`_treeObject` /
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
// After #141: the new town-producer entities must land on exactly these cells.
// Compare the emitted `{kind:"prop", ...}` list against these snapshots, then
// delete this file — it is scaffolding, not a permanent spec.

import { describe, expect, it } from 'vitest'
import { buildTown, type Town } from './town.ts'
import { planFlowers } from './town.ts'
import { tallPropsFor } from './phaser/townTileset.js'

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

describe('town prop placement (characterization for #141)', () => {
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

  it('tallPropsFor maps each T cell to one tree placement when art is present', () => {
    // Guarded: when the tree art glob resolves, tallPropsFor must emit exactly
    // one {key:"prop.tree", col, row} per T cell, in the same order. When it
    // doesn't (no asset), it returns [] and there is nothing to pin here — the
    // treeCells snapshot above still locks the geometry.
    const placed = tallPropsFor(town) as Array<{ key: string; col: number; row: number }>
    if (placed.length === 0) return
    const expected = treeCells(town).map((c) => ({ key: 'prop.tree', col: c.col, row: c.row }))
    expect(placed).toEqual(expected)
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
