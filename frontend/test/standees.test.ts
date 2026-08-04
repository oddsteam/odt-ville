import { describe, expect, it } from 'vitest'

import { applyStandeeFrame, type StandeeNote } from '../src/game/standees.ts'

// Standees appearing and vanishing live (#375): folding one map-wide standee
// frame into the roster the scene renders. Mirrors presence.test.ts — own
// echoes and malformed frames fold to 'none' and never crash the render loop.
describe('applyStandeeFrame', () => {
  const OWN = 'own-kc-sub'

  const wire = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    x: 3,
    y: 5,
    message: 'Board games at 4',
    mine: false,
    detail: null,
    reply_link: null,
    owner_name: 'Ada Lovelace',
    owner_avatar_url: '/api/v1/users/peer-1/avatar',
    character_manifest_id: 7,
    ...over,
  })

  const deploy = (id: number, userId = 'peer-1', over = {}) =>
    ({ type: 'standee:deploy', userId, standee: wire(id, over) }) as const
  const pickup = (id: number, userId = 'peer-1') =>
    ({ type: 'standee:pickup', userId, id }) as const

  const note = (id: number): StandeeNote => ({
    id,
    message: 'already here',
    detail: null,
    ownerName: null,
    ownerAvatarUrl: null,
    replyLink: null,
    mine: false,
    tile: { x: 0, y: 0 },
    manifestId: null,
  })

  it('names a deployed Standee for the scene to stand up, folded to the live shape', () => {
    const roster: StandeeNote[] = []

    const result = applyStandeeFrame(roster, deploy(9), OWN)

    expect(result).toEqual({
      action: 'add',
      standee: {
        id: 9,
        message: 'Board games at 4',
        detail: null,
        ownerName: 'Ada Lovelace',
        ownerAvatarUrl: '/api/v1/users/peer-1/avatar',
        replyLink: null,
        mine: false,
        tile: { x: 3, y: 5 },
        manifestId: 7,
      },
    })
    // The sprite is the scene's to make, so the entry lands there, not here.
    expect(roster).toEqual([])
  })

  it('takes a picked-up Standee off the roster and hands back the one removed', () => {
    const taken = note(1)
    const roster = [taken, note(2)]

    const result = applyStandeeFrame(roster, pickup(1), OWN)

    // The scene gets the entry back so it can destroy that cutout's sprite.
    expect(result).toEqual({ action: 'remove', standee: taken })
    expect(roster.map((s) => s.id)).toEqual([2])
  })

  it('ignores our own echoes — our cutout went up (or came down) on the write', () => {
    const roster = [note(1)]

    expect(applyStandeeFrame(roster, deploy(9, OWN), OWN)).toEqual({ action: 'none' })
    expect(applyStandeeFrame(roster, pickup(1, OWN), OWN)).toEqual({ action: 'none' })
    expect(roster.map((s) => s.id)).toEqual([1])
  })

  it('ignores a deploy for a Standee already standing, so a replay cannot double it', () => {
    const roster = [note(9)]

    expect(applyStandeeFrame(roster, deploy(9), OWN)).toEqual({ action: 'none' })
    expect(roster).toHaveLength(1)
  })

  it('ignores a pick-up for a Standee we never had', () => {
    const roster = [note(1)]

    expect(applyStandeeFrame(roster, pickup(404), OWN)).toEqual({ action: 'none' })
    expect(roster).toHaveLength(1)
  })

  it('folds a malformed frame to a no-op rather than crashing the render loop', () => {
    const roster: StandeeNote[] = []
    const noop = { action: 'none' }

    expect(applyStandeeFrame(roster, undefined, OWN)).toEqual(noop)
    expect(applyStandeeFrame(roster, {}, OWN)).toEqual(noop)
    expect(applyStandeeFrame(roster, { type: 'move', userId: 'peer-1' }, OWN)).toEqual(noop)
    expect(applyStandeeFrame(roster, { type: 'standee:deploy', userId: 7 }, OWN)).toEqual(noop)
    expect(applyStandeeFrame(roster, { type: 'standee:deploy', userId: 'peer-1' }, OWN)).toEqual(noop)
    expect(applyStandeeFrame(roster, deploy(9, 'peer-1', { x: 'over there' }), OWN)).toEqual(noop)
    expect(applyStandeeFrame(roster, { type: 'standee:pickup', userId: 'peer-1' }, OWN)).toEqual(noop)
    expect(roster).toEqual([])
  })

  it('rides through a Standee with no rig — the scene draws the bundled fallback', () => {
    const result = applyStandeeFrame([], deploy(9, 'peer-1', { character_manifest_id: null }), OWN)

    expect(result).toMatchObject({ action: 'add', standee: { manifestId: null } })
  })
})
