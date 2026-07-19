// Resolving a trainer payload's npcId into a duel opponent (#259).

import { describe, expect, it } from 'vitest'
import { npcOpponent, trainerOpponent, type NpcLike } from './trainerDuel.ts'

const boss: NpcLike = { id: 7, name: 'THE BOSS', level: 99, image: 'data:boss' }
const wanderer: NpcLike = { id: 3, name: 'Wanderer', level: null, image: 'data:w' }

describe('npcOpponent', () => {
  it('maps a catalog NPC to the trainer opponent EncounterScene launches with', () => {
    expect(npcOpponent(boss)).toEqual({
      kind: 'trainer',
      id: 7,
      name: 'THE BOSS',
      level: 99,
      sprite: 'data:boss',
    })
  })

  it('carries a null level through (the duel screen omits the Lv. line)', () => {
    expect(npcOpponent(wanderer).level).toBeNull()
  })
})

describe('trainerOpponent', () => {
  it('resolves the referenced NPC out of the loaded catalog', () => {
    expect(trainerOpponent([wanderer, boss], 7)).toMatchObject({ name: 'THE BOSS', sprite: 'data:boss' })
  })

  it('is null for the unset sentinel (npcId 0) — no duel starts', () => {
    expect(trainerOpponent([boss], 0)).toBeNull()
  })

  it('is null for a reference to a deleted/unknown NPC', () => {
    expect(trainerOpponent([boss], 999)).toBeNull()
  })

  it('is null against an empty catalog — challenges nobody', () => {
    expect(trainerOpponent([], 7)).toBeNull()
  })
})
