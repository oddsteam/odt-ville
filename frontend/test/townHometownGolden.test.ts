import { describe, expect, it } from 'vitest'

import { buildTown, tileChar } from '../src/game/town.ts'
import type { Town } from '../src/game/town.ts'

// Characterization net for the GENERATED hometown.
//
// Issues #80 (generalize the autotile engine to Tile Catalog data) and #81
// (converge `buildTown` onto the shared engine, emitting the runtime map shape)
// are refactors whose acceptance bar is "the hometown is unchanged." Since the
// Sandcastle verify step runs typecheck + Vitest only — no visual/e2e — these
// snapshots are the ONLY machine-checkable proxy for "renders identically".
//
// They pin the player-observable generated map for fixed inputs: the terrain
// layout (grass/dirt/road/street/field/plot chars) and the building + entrance
// placement. `buildTown` is deterministic today (decoration is a pure function
// of plot count; the seed hook is a future addition), so these are stable.
//
// DO NOT run `vitest -u` to "make it pass" if a refactor changes these. A changed
// snapshot here is a hometown regression or a deliberate HITL design change —
// either way it is a STOP, not a test to update.

function terrainGrid(town: Town): string[] {
  const rows: string[] = []
  for (let y = 0; y < town.rows; y++) {
    let row = ''
    for (let x = 0; x < town.cols; x++) row += tileChar(town, x, y)
    rows.push(row)
  }
  return rows
}

describe('generated hometown — characterization (golden)', () => {
  for (const count of [1, 6, 12]) {
    it(`terrain layout is stable for ${count} plots`, () => {
      const grid = terrainGrid(buildTown(count))
      // Cheap structural invariants that survive even an (illicit) snapshot
      // regeneration — a corrupted/empty grid trips here regardless.
      expect(grid.length).toBeGreaterThan(0)
      expect(new Set(grid.map((r) => r.length)).size).toBe(1) // rectangular
      expect(grid).toMatchSnapshot()
    })

    it(`plot + entrance placement is stable for ${count} plots`, () => {
      const { plots, entrance, cols, rows } = buildTown(count)
      expect(plots).toHaveLength(count)
      expect({ cols, rows, entrance, plots }).toMatchSnapshot()
    })
  }
})
