import { describe, expect, it } from 'vitest'

import { townInteractionsAt } from '../src/game/phaser/townInteractions.ts'

// Minimal town: grass ('g') at (1,1), everything else plain ground.
const town = { rows: 3, cols: 3, map: ['...', '.g.', '...'] }

const community = { id: 'odd-team' }
const buildings = [{ doorCol: 0, doorRow: 0, community }]

describe('townInteractionsAt', () => {
  it('yields enter-community with no gate on an ungated door tile', () => {
    expect(townInteractionsAt({ town, buildings, sightCells: [] }, { x: 0, y: 0 })).toEqual([
      { kind: 'enterCommunity', community, gate: null },
    ])
  })

  it('carries the community entry_gate on a gated door tile', () => {
    const gated = { id: 'hr', entry_gate: 'posture-login' }
    const gatedBuildings = [{ doorCol: 0, doorRow: 0, community: gated }]
    expect(
      townInteractionsAt({ town, buildings: gatedBuildings, sightCells: [] }, { x: 0, y: 0 }),
    ).toEqual([{ kind: 'enterCommunity', community: gated, gate: 'posture-login' }])
  })

  it('yields maybe-wild on a tall-grass tile', () => {
    expect(townInteractionsAt({ town, buildings, sightCells: [] }, { x: 1, y: 1 })).toEqual([
      { kind: 'maybeWild' },
    ])
  })

  it('yields start-duel on a trainer sight cell', () => {
    const sightCells = [{ x: 2, y: 2 }]
    expect(townInteractionsAt({ town, buildings, sightCells }, { x: 2, y: 2 })).toEqual([
      { kind: 'startDuel' },
    ])
  })

  it('resolves the trainer before the wild roll on the same tile', () => {
    const sightCells = [{ x: 1, y: 1 }]
    expect(townInteractionsAt({ town, buildings, sightCells }, { x: 1, y: 1 })).toEqual([
      { kind: 'startDuel' },
      { kind: 'maybeWild' },
    ])
  })

  it('yields nothing on plain ground', () => {
    expect(townInteractionsAt({ town, buildings, sightCells: [] }, { x: 2, y: 0 })).toEqual([])
  })
})
