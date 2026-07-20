import { describe, expect, it } from 'vitest'

import { applyFrame, pruneOutOfRange, type RemotePlayer } from '../src/game/presence.ts'

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
