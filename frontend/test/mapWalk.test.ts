import { describe, expect, it } from 'vitest'

import { spawnTile, inBoundsWalkable, feetWorldXY } from '../src/game/phaser/mapWalk.ts'
import { stepTile, type Direction } from '../src/game/phaser/movement.ts'
import { TILE, PLAYER_FEET_LIFT } from '../src/game/constants.js'

describe('spawnTile', () => {
  it('spawns at the centre of the authored grid', () => {
    expect(spawnTile({ cols: 8, rows: 6 })).toEqual({ x: 4, y: 3 })
  })

  it('floors odd sizes onto the grid', () => {
    expect(spawnTile({ cols: 9, rows: 7 })).toEqual({ x: 4, y: 3 })
  })

  it('stays on-grid for the smallest possible map', () => {
    expect(spawnTile({ cols: 1, rows: 1 })).toEqual({ x: 0, y: 0 })
  })
})

describe('inBoundsWalkable', () => {
  const walkable = inBoundsWalkable({ cols: 8, rows: 6 })

  it('allows every cell inside the grid, corners included', () => {
    expect(walkable(0, 0)).toBe(true)
    expect(walkable(7, 5)).toBe(true)
    expect(walkable(4, 3)).toBe(true)
  })

  it('rejects each side just past the edge', () => {
    expect(walkable(-1, 3)).toBe(false) // west
    expect(walkable(8, 3)).toBe(false) // east
    expect(walkable(4, -1)).toBe(false) // north
    expect(walkable(4, 6)).toBe(false) // south
  })
})

describe('feetWorldXY', () => {
  it('centres the feet horizontally and lands them on the tile floor', () => {
    expect(feetWorldXY({ x: 2, y: 3 }, true)).toEqual({
      x: 2 * TILE + TILE / 2,
      y: 4 * TILE,
    })
  })

  it('lifts the bundled (non-manifest) sprite to compensate its padded box', () => {
    expect(feetWorldXY({ x: 2, y: 3 }, false)).toEqual({
      x: 2 * TILE + TILE / 2,
      y: 4 * TILE + PLAYER_FEET_LIFT,
    })
  })
})

// The walking loop MapScene wires: the shared stepTile with the map rules.
// A fake tween manager stands in for Phaser (same rig as movement.test.ts).
describe('walking an authored map', () => {
  const map = { cols: 8, rows: 6 }

  function walkOne(from: { x: number; y: number }, dir: Direction) {
    const added: Array<{ config: { x: number; y: number } }> = []
    const scene = { tweens: { add: (config: never) => (added.push({ config }), added[0]) } }
    const result = stepTile({
      scene,
      target: {},
      from,
      dir,
      walkable: inBoundsWalkable(map),
      toWorldXY: (t) => feetWorldXY(t, true),
      duration: 100,
    })
    return { result, added }
  }

  it('steps from spawn to the neighbouring tile', () => {
    const { result, added } = walkOne(spawnTile(map), 'left')
    expect(result.blocked).toBe(false)
    expect(result.newTile).toEqual({ x: 3, y: 3 })
    expect(added[0].config).toMatchObject(feetWorldXY({ x: 3, y: 3 }, true))
  })

  it('blocks a step off the west edge', () => {
    const { result, added } = walkOne({ x: 0, y: 3 }, 'left')
    expect(result.blocked).toBe(true)
    expect(result.newTile).toBeNull()
    expect(added).toHaveLength(0)
  })

  it('blocks a step off the south edge', () => {
    const { result } = walkOne({ x: 4, y: 5 }, 'down')
    expect(result.blocked).toBe(true)
  })
})
