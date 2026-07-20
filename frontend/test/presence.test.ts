import { describe, expect, it } from 'vitest'

import { applyFrame, type RemotePlayer } from '../src/game/presence.ts'

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
    expect(roster.get('peer-1')).toEqual({ name: 'Pat', x: 1, y: 2, facing: 'down' })
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
})
