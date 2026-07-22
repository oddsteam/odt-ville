// Resolving a trainer payload's npcId into a duel opponent (#259, #260).

import { describe, expect, it } from 'vitest'
import { npcOpponent, trainerOpponent, type NpcLike } from './trainerDuel.ts'
import { GATE_TRAINER } from '../encounters.js'

const boss: NpcLike = { id: 7, name: 'THE BOSS', level: 99 }
const wanderer: NpcLike = { id: 3, name: 'Wanderer', level: null }

describe('npcOpponent', () => {
  it('maps a catalog NPC to the trainer opponent EncounterScene launches with', () => {
    expect(npcOpponent(boss)).toEqual({
      kind: 'trainer',
      id: 7,
      name: 'THE BOSS',
      level: 99,
      sprite: GATE_TRAINER.sprite,
    })
  })

  it('keeps the authored identity while borrowing the bundled portrait (#260)', () => {
    // An NPC's art is a mapped rig now, and the duel screen still wants a whole
    // image — so name and level come from the catalog row while the portrait is
    // the bundled boss for every trainer, until a follow-up renders the rig.
    const shown = npcOpponent(wanderer)
    expect(shown.name).toBe('Wanderer')
    expect(shown.sprite).toBe(npcOpponent(boss).sprite)
  })

  it('carries a null level through (the duel screen omits the Lv. line)', () => {
    expect(npcOpponent(wanderer).level).toBeNull()
  })
})

describe('trainerOpponent', () => {
  it('resolves the referenced NPC out of the loaded catalog', () => {
    expect(trainerOpponent([wanderer, boss], 7)).toMatchObject({ name: 'THE BOSS' })
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
