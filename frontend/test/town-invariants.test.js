import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTown, tileChar, typeForTileChar } from '../src/game/town.js'
import {
  AUTOTILED_TERRAINS,
  ORTHOGONAL_DIRS,
  coverageTerrainForCell,
  dirtLayerTileForCell,
  groundPaintStackForCell,
  roadLayerCoversCell,
} from '../src/game/phaser/groundModel.js'

const colLabel = (index) => {
  let label = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label
  }
  return label
}

const cellName = (x, y) => `${colLabel(x)}${y + 1}`

test('generated towns have no one-tile-wide autotiled terrain strips', () => {
  const violations = []

  for (let plotCount = 1; plotCount <= 50; plotCount++) {
    const town = buildTown(plotCount)
    for (let y = 0; y < town.rows; y++) {
      for (let x = 0; x < town.cols; x++) {
        const terrain = typeForTileChar(town.map[y][x])
        if (!AUTOTILED_TERRAINS.has(terrain)) continue

        const neighbour = (dx, dy) =>
          typeForTileChar(tileChar(town, x + dx, y + dy))
        const north = neighbour(0, -1)
        const south = neighbour(0, 1)
        const east = neighbour(1, 0)
        const west = neighbour(-1, 0)
        const vertical = north && south && north !== terrain && south !== terrain
        const horizontal = east && west && east !== terrain && west !== terrain

        if (vertical || horizontal) {
          violations.push(
            `plotCount=${plotCount} ${cellName(x, y)} (${terrain}, ${
              vertical ? `N=${north}/S=${south}` : `E=${east}/W=${west}`
            })`,
          )
        }
      }
    }
  }

  assert.deepEqual(violations, [], `terrain strip violations:\n${violations.join('\n')}`)
})

test('every transparent terrain edge has its selected opaque backing fill', () => {
  const holes = []
  const coveredSeams = new Set()

  for (let plotCount = 1; plotCount <= 50; plotCount++) {
    const town = buildTown(plotCount)
    for (let y = 0; y < town.rows; y++) {
      for (let x = 0; x < town.cols; x++) {
        const paints = groundPaintStackForCell(town, x, y)
        const edge = paints.at(-1)
        if (edge?.role !== 'edge') continue
        const beneathEdge = paints.at(-2)

        if (
          !beneathEdge?.opaque ||
          beneathEdge.role !== 'coverage' ||
          !(beneathEdge.depth < edge.depth)
        ) {
          holes.push(
            `plotCount=${plotCount} ${cellName(x, y)} (${edge.terrain}, backing=${beneathEdge?.terrain || 'canvas'})`,
          )
        } else {
          coveredSeams.add(`${edge.terrain}->${beneathEdge.terrain}`)
        }
      }
    }
  }

  assert.deepEqual(holes, [], `transparent coverage holes:\n${holes.join('\n')}`)
  assert.deepEqual(
    [...coveredSeams].sort(),
    ['dirt->road', 'grass->dirt', 'grass->road'],
  )
})

test('coverage precedence chooses the highest-stacked differing neighbour', () => {
  const town = { cols: 3, rows: 3, map: ['.:.', '...', '.g.'] }
  assert.equal(coverageTerrainForCell(town, 1, 1, 'grass'), 'dirt')

  const directions = ORTHOGONAL_DIRS.map(({ d }) => d)
  assert.deepEqual(directions, ['N', 'S', 'E', 'W'])
})

test('higher terrain owns each seam without changing logical terrain', () => {
  const dirtGrass = { cols: 2, rows: 1, map: ['g.'] }
  assert.deepEqual(groundPaintStackForCell(dirtGrass, 0, 0), [
    { terrain: 'dirt', role: 'fill', opaque: true, depth: 0.1 },
  ])
  assert.deepEqual(groundPaintStackForCell(dirtGrass, 1, 0), [
    { terrain: 'dirt', role: 'coverage', opaque: true, depth: 0.1 },
    { terrain: 'grass', role: 'edge', opaque: false, depth: 0.2 },
  ])

  const roadDirt = { cols: 2, rows: 1, map: [':g'] }
  assert.deepEqual(groundPaintStackForCell(roadDirt, 0, 0), [
    { terrain: 'road', role: 'fill', opaque: true, depth: 0 },
  ])
  assert.deepEqual(groundPaintStackForCell(roadDirt, 1, 0), [
    { terrain: 'road', role: 'coverage', opaque: true, depth: 0 },
    { terrain: 'dirt', role: 'edge', opaque: false, depth: 0.1 },
  ])
})

test('dirt underlay forms two complete autotiled rectangles around the road', () => {
  const town = buildTown(1)
  const expected = {
    D10: ['corner', 'NW'],
    H10: ['corner', 'NE'],
    J10: ['corner', 'NW'],
    O10: ['corner', 'NE'],
    D18: ['corner', 'SW'],
    H18: ['corner', 'SE'],
    J18: ['corner', 'SW'],
    O18: ['corner', 'SE'],
    E10: ['edge', 'N'],
    E18: ['edge', 'S'],
  }

  for (const [cell, [role, side]] of Object.entries(expected)) {
    const x = cell.charCodeAt(0) - 65
    const y = Number(cell.slice(1)) - 1
    assert.deepEqual(dirtLayerTileForCell(town, x, y), { role, side }, cell)
  }
  assert.equal(dirtLayerTileForCell(town, 8, 9), null, 'I10 road remains separate')
  assert.equal(dirtLayerTileForCell(town, 8, 17), null, 'I18 road remains separate')
})

test('road base bleed includes diagonal cap and boundary cells', () => {
  const town = buildTown(1)
  for (const cell of ['P7', 'P8', 'P9', 'A1', 'B1', 'C1', 'A20', 'B20', 'C20']) {
    const x = cell.charCodeAt(0) - 65
    const y = Number(cell.slice(1)) - 1
    assert.equal(roadLayerCoversCell(town, x, y), true, cell)
  }
})
