// Proximity voice on the village door path (#287): a door enters an authored
// map inside the village's own game, so nothing unmounts between hops and the
// shell must tear down the previous mesh itself — exactly one voice mesh open
// at a time, the counterpart of presenceSession (#269).

import { describe, expect, it } from 'vitest'
import { voiceSession } from './voiceSession.ts'

const mesh = (log: unknown[], slug: string) => ({
  update: () => {},
  stop: () => log.push(['stop', slug]),
})

const deps = (log: unknown[], ownId: string | null = 'kc-1') => ({
  viewerId: async () => ownId,
  connect: (slug: string, id: string) => {
    log.push(['connect', slug, id])
    return mesh(log, slug)
  },
})

describe('voiceSession', () => {
  it('opens a mesh for a multiplayer map, carrying the viewer id', async () => {
    const log: unknown[] = []
    const open = await voiceSession(deps(log)).open({ slug: 'compliance-hq', multiplayer: true })
    expect(log).toEqual([['connect', 'compliance-hq', 'kc-1']])
    expect(open).not.toBeNull()
  })

  it('opens nothing for a solo map', async () => {
    const log: unknown[] = []
    const open = await voiceSession(deps(log)).open({ slug: 'quiet-room', multiplayer: false })
    expect(log).toEqual([])
    expect(open).toBeNull()
  })

  it('opens nothing when the viewer is unknown', async () => {
    const log: unknown[] = []
    const open = await voiceSession(deps(log, null)).open({ slug: 'hq', multiplayer: true })
    expect(log).toEqual([])
    expect(open).toBeNull()
  })

  it('tears down the previous mesh on an onward hop, before opening the next', async () => {
    const log: unknown[] = []
    const session = voiceSession(deps(log))
    await session.open({ slug: 'hq', multiplayer: true })
    await session.open({ slug: 'annexe', multiplayer: true })
    expect(log).toEqual([
      ['connect', 'hq', 'kc-1'],
      ['stop', 'hq'],
      ['connect', 'annexe', 'kc-1'],
    ])
  })

  it('stops the mesh on exit, and stays stopped on a second close', async () => {
    const log: unknown[] = []
    const session = voiceSession(deps(log))
    await session.open({ slug: 'hq', multiplayer: true })
    session.close()
    session.close()
    expect(log).toEqual([['connect', 'hq', 'kc-1'], ['stop', 'hq']])
  })

  it('tears down the previous mesh even when hopping to a solo map', async () => {
    const log: unknown[] = []
    const session = voiceSession(deps(log))
    await session.open({ slug: 'hq', multiplayer: true })
    await session.open({ slug: 'quiet-room', multiplayer: false })
    expect(log).toEqual([['connect', 'hq', 'kc-1'], ['stop', 'hq']])
  })
})
