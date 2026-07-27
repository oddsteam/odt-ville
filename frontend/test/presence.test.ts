import { describe, expect, it } from 'vitest'

import {
  applyFrame,
  pruneOutOfRange,
  type Card,
  type RemotePlayer,
} from '../src/game/presence.ts'

// Presence multiplayer (#88): folding wire frames into the remote-player
// roster. The roster sync is stateless echo — first sighting of a peer means
// they don't know us yet, so we re-announce our own position.
describe('applyFrame', () => {
  const OWN = 'own-kc-sub'
  const move = (userId: string, x = 1, y = 2) =>
    ({ type: 'move', userId, name: 'Pat', x, y, facing: 'down' }) as const

  it('spawns an unknown peer and asks for an echo', () => {
    const roster = new Map<string, RemotePlayer>()

    const result = applyFrame(roster, move('peer-1'), OWN)

    expect(result).toEqual({ action: 'spawn', echo: true })
    expect(roster.get('peer-1')).toEqual({
      name: 'Pat',
      x: 1,
      y: 2,
      facing: 'down',
      manifestId: null,
      card: null,
    })
  })

  it('moves a known peer without echoing', () => {
    const roster = new Map<string, RemotePlayer>()
    applyFrame(roster, move('peer-1'), OWN)

    const result = applyFrame(roster, move('peer-1', 5, 6), OWN)

    expect(result).toEqual({ action: 'move', echo: false })
    expect(roster.get('peer-1')).toMatchObject({ x: 5, y: 6 })
  })

  it('ignores our own echoed frames', () => {
    const roster = new Map<string, RemotePlayer>()

    const result = applyFrame(roster, move(OWN), OWN)

    expect(result).toEqual({ action: 'none', echo: false })
    expect(roster.size).toBe(0)
  })

  it('removes a peer on leave', () => {
    const roster = new Map<string, RemotePlayer>()
    applyFrame(roster, move('peer-1'), OWN)

    const result = applyFrame(roster, { type: 'leave', userId: 'peer-1', name: 'Pat' }, OWN)

    expect(result).toEqual({ action: 'remove', echo: false })
    expect(roster.size).toBe(0)
  })

  it('ignores a leave for a peer it never saw', () => {
    const result = applyFrame(new Map(), { type: 'leave', userId: 'ghost', name: 'G' }, OWN)

    expect(result).toEqual({ action: 'none', echo: false })
  })

  it('ignores a malformed frame instead of crashing the scene', () => {
    const result = applyFrame(new Map(), { type: 'move' } as never, OWN)

    expect(result).toEqual({ action: 'none', echo: false })
  })

  // Peers render each other's real character (#266): the sender's manifest id
  // is stamped server-side and lands on the entry the scene renders from.
  describe('manifestId', () => {
    const withManifest = (manifestId: number | null) => ({ ...move('peer-1'), manifestId })

    it('carries the sender manifest id onto the roster', () => {
      const roster = new Map<string, RemotePlayer>()

      applyFrame(roster, withManifest(42), OWN)

      expect(roster.get('peer-1')?.manifestId).toBe(42)
    })

    it('folds a frame with no manifest id to null — the bundled stills', () => {
      const roster = new Map<string, RemotePlayer>()

      applyFrame(roster, move('peer-1'), OWN)

      expect(roster.get('peer-1')?.manifestId).toBeNull()
    })

    it('follows a peer who switches character mid-session', () => {
      const roster = new Map<string, RemotePlayer>()
      applyFrame(roster, withManifest(42), OWN)

      expect(applyFrame(roster, withManifest(7), OWN).action).toBe('move')
      expect(roster.get('peer-1')?.manifestId).toBe(7)
    })
  })

  // Card badges (#317): a card rides both the live `card` frame and the
  // position frames, so a peer who walks into range after the change still
  // shows one. Eira is the store of record — we only fold what it pushed.
  describe('card', () => {
    const CARD: Card = {
      title: 'Wire up the pathfinder',
      status: 'DOING',
      url: 'https://jira/browse/ONEREV-1',
    }
    const card = (userId: string, value: Card | null) =>
      ({ type: 'card', userId, card: value }) as const

    it('spawns a peer already holding their card', () => {
      const roster = new Map<string, RemotePlayer>()

      applyFrame(roster, { ...move('peer-1'), card: CARD }, OWN)

      expect(roster.get('peer-1')?.card).toEqual(CARD)
    })

    it('folds a live card onto a peer already on the roster', () => {
      const roster = new Map<string, RemotePlayer>()
      applyFrame(roster, move('peer-1'), OWN)

      const result = applyFrame(roster, card('peer-1', CARD), OWN)

      expect(result).toEqual({ action: 'card', echo: false })
      expect(roster.get('peer-1')?.card).toEqual(CARD)
    })

    // Null means "put the card down", not "no update".
    it('clears the card on a null', () => {
      const roster = new Map<string, RemotePlayer>()
      applyFrame(roster, { ...move('peer-1'), card: CARD }, OWN)

      applyFrame(roster, card('peer-1', null), OWN)

      expect(roster.get('peer-1')?.card).toBeNull()
    })

    // Eira retries, so the same delivery arrives twice — last write wins, and
    // the same write twice is the same state.
    it('is idempotent', () => {
      const roster = new Map<string, RemotePlayer>()
      applyFrame(roster, move('peer-1'), OWN)

      applyFrame(roster, card('peer-1', CARD), OWN)
      applyFrame(roster, card('peer-1', CARD), OWN)

      expect(roster.get('peer-1')?.card).toEqual(CARD)
    })

    // The card stream is unpartitioned — every client hears about everyone —
    // so a card for a peer out of range must not conjure them onto the roster.
    it('ignores a card for someone not on the roster', () => {
      const roster = new Map<string, RemotePlayer>()

      const result = applyFrame(roster, card('stranger', CARD), OWN)

      expect(result).toEqual({ action: 'none', echo: false })
      expect(roster.size).toBe(0)
    })

    it('ignores our own card — we wear no nameplate to hang it on', () => {
      const result = applyFrame(new Map(), card(OWN, CARD), OWN)

      expect(result).toEqual({ action: 'none', echo: false })
    })

    it('folds a card-less move frame to no card', () => {
      const roster = new Map<string, RemotePlayer>()

      applyFrame(roster, move('peer-1'), OWN)

      expect(roster.get('peer-1')?.card).toBeNull()
    })
  })
})

// Interest management (#158): the server stops streaming a cell once we walk
// out of its neighbourhood, so no `leave` ever arrives for the peers standing
// in it — they'd linger on the roster frozen at their last tile. The scene
// prunes them itself after each step.
describe('pruneOutOfRange', () => {
  const at = (x: number, y: number): RemotePlayer => ({
    name: 'Pat',
    x,
    y,
    facing: 'down',
    manifestId: null,
    card: null,
  })

  it('keeps a peer inside the neighbourhood window', () => {
    const roster = new Map([['peer-1', at(20, 4)]])

    expect(pruneOutOfRange(roster, { x: 3, y: 4 })).toEqual([])
    expect(roster.size).toBe(1)
  })

  it('drops a peer whose cell fell out of the neighbourhood', () => {
    const roster = new Map([['peer-1', at(3, 4)]])

    // We crossed east into cell 3,0 — cell 0,0 is no longer a neighbour.
    expect(pruneOutOfRange(roster, { x: 40, y: 4 })).toEqual(['peer-1'])
    expect(roster.size).toBe(0)
  })

  it('keeps the peer directly across a cell boundary — that is the margin', () => {
    const roster = new Map([['peer-1', at(11, 4)]])

    expect(pruneOutOfRange(roster, { x: 12, y: 4 })).toEqual([])
  })
})
