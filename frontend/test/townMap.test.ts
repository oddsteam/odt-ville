import { describe, expect, it } from 'vitest'

import { buildTown, tileChar, typeForTileChar } from '../src/game/town.ts'
import type { Town } from '../src/game/town.ts'
import { bakeTownGround, buildTownMap, townTerrainSource } from '../src/game/townMap.ts'
import { bakeGround } from '../src/maps/baker.ts'
import type { SourceMap } from '../src/maps/baker.ts'
import { HOMETOWN_CATALOG } from '../src/game/phaser/tileCatalog.ts'

// #81: `buildTown` converges onto the SHARED producer — the same Map Baker the
// authored map uses (ADR-0003/0004). These pin the convergence:
//   * the generated hometown emits the runtime map shape (a baked ground) via
//     the shared engine, autotiling resolved in the producer; and
//   * generated and authored maps resolve identical tiles for identical terrain.
// The hometown's geometry (terrain chars, plots, entrance) is pinned BYTE-FOR-
// BYTE by townHometownGolden.test.ts and is untouched here.

// Frame math is row * cols + col; the hometown sheet declares 32 columns.
const f = (col: number, row: number) => row * 32 + col

// Terrain priority as persisted (#120), low→high — the same data the editor
// reads. The town's terrains (road < dirt < grass) keep their order under it, so
// the bake is byte-identical to the old hardcoded stack.
const PRIORITY = ['water', 'road', 'sand', 'dirt', 'grass']

// An independent authored source document with the town's terrain — the shape an
// editor would save. Built without townTerrainSource so the equality test below
// genuinely compares two producers, not a function against itself.
function authoredFromTown(town: Town): SourceMap {
  return {
    slug: 'authored',
    title: 'Authored',
    cols: town.cols,
    rows: town.rows,
    terrain: town.map.map((rowStr) => [...rowStr].map((ch) => typeForTileChar(ch))),
  }
}

describe('townTerrainSource', () => {
  it('presents every town cell as a painted terrain (the hometown is fully terrained)', () => {
    const src = townTerrainSource(buildTown(6))
    expect(src.rows).toBe(src.terrain.length)
    expect(new Set(src.terrain.map((r) => r.length)).size).toBe(1)
    // typeForTileChar classifies every hometown char (grass/dirt/road), so no
    // cell is unpainted — the whole ground bakes.
    expect(src.terrain.every((row) => row.every((t) => t != null))).toBe(true)
  })
})

describe('bakeTownGround — runtime map shape via the shared engine', () => {
  it('bakes a ground sized to the town', () => {
    const town = buildTown(6)
    const ground = bakeTownGround(town, PRIORITY)
    expect(ground.cols).toBe(town.cols)
    expect(ground.rows).toBe(town.rows)
    expect(ground.cells).toHaveLength(town.rows)
    expect(ground.cells[0]).toHaveLength(town.cols)
  })

  it('only references the bundled terrain sheet it actually used', () => {
    const ground = bakeTownGround(buildTown(1), PRIORITY)
    expect(ground.tilesets).toEqual([{ name: '1_Terrains_and_Fences_32x32', cell: 32 }])
  })

  it('bakes plain open ground to a single grass fill', () => {
    const town = buildTown(6)
    // An interior open-ground cell with grass on all four sides resolves to one
    // grass fill at grass depth (0.2) — no seam, no autotile.
    const at = findCell(town, (x, y) => {
      if (typeForTileChar(tileChar(town, x, y)) !== 'grass') return false
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
        if (typeForTileChar(tileChar(town, x + dx, y + dy)) !== 'grass') return false
      }
      return true
    })
    const ground = bakeTownGround(town, PRIORITY)
    expect(ground.cells[at.y][at.x]).toEqual([
      { tileset: '1_Terrains_and_Fences_32x32', frame: f(2, 0), depth: 0.2 },
    ])
  })

  it('owns the grass/dirt-field seam from the grass side (dirt coverage + grass edge)', () => {
    const town = buildTown(6)
    // A grass cell with the dirt field directly to its south and grass on the
    // other three sides: grass (higher) owns the seam → dirt coverage beneath a
    // transparent grass S edge. This is the shared autotile engine, baked once.
    const at = findCell(town, (x, y) => {
      if (typeForTileChar(tileChar(town, x, y)) !== 'grass') return false
      if (typeForTileChar(tileChar(town, x, y + 1)) !== 'dirt') return false
      return (
        typeForTileChar(tileChar(town, x, y - 1)) === 'grass' &&
        typeForTileChar(tileChar(town, x - 1, y)) === 'grass' &&
        typeForTileChar(tileChar(town, x + 1, y)) === 'grass'
      )
    })
    const ground = bakeTownGround(town, PRIORITY)
    expect(ground.cells[at.y][at.x]).toEqual([
      { tileset: '1_Terrains_and_Fences_32x32', frame: f(1, 0), depth: 0.1 }, // dirt coverage
      { tileset: '1_Terrains_and_Fences_32x32', frame: f(2, 1), depth: 0.2 }, // grass S edge
    ])
  })
})

describe('generated and authored maps resolve identical tiles for identical terrain', () => {
  for (const count of [1, 6, 12]) {
    it(`the town producer and an authored document bake the same ground (${count} plots)`, () => {
      const town = buildTown(count)
      const authored = bakeGround(authoredFromTown(town), HOMETOWN_CATALOG)
      expect(bakeTownGround(town, PRIORITY)).toEqual(authored)
    })
  }
})

describe('buildTownMap', () => {
  it('emits the town geometry unchanged plus the baked runtime ground', () => {
    const town = buildTown(6)
    const map = buildTownMap(6, PRIORITY)
    // Geometry is byte-identical to buildTown (the golden net guards this); the
    // baked ground is added alongside as the runtime map shape.
    expect({ cols: map.cols, rows: map.rows, map: map.map, plots: map.plots, entrance: map.entrance, entities: map.entities }).toEqual(town)
    expect(map.ground).toEqual(bakeTownGround(town, PRIORITY))
  })
})

// Locate the first cell (row-major) satisfying `pred`, failing loudly if none —
// the hometown always has open ground and a dirt field, so these exist.
function findCell(town: Town, pred: (x: number, y: number) => boolean): { x: number; y: number } {
  for (let y = 0; y < town.rows; y++) {
    for (let x = 0; x < town.cols; x++) if (pred(x, y)) return { x, y }
  }
  throw new Error('no matching cell')
}
