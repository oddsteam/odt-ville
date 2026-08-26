// Presence on the village door path (#269): entering an authored map through a
// door never routes, so nothing unmounts between hops and the shell must close
// the old room itself — exactly one room open at a time, the counterpart of
// "exactly one map loaded at a time".

import { describe, expect, it } from 'vitest'
import { presenceSession } from './presenceSession.ts'

const handle = (log: unknown[], slug: string) => ({
  send: () => {},
  onFrame: () => {},
  disconnect: () => log.push(['disconnect', slug]),
})

const loadManifest = async (id: number) => ({ id })

const deps = (log: unknown[], ownId: string | null = 'kc-1') => ({
  viewer: async () => (ownId ? { id: ownId, name: 'Ada Lovelace' } : null),
  connect: (slug: string) => {
    log.push(['connect', slug])
    return handle(log, slug)
  },
  loadManifest,
})

describe('presenceSession', () => {
  it('opens a room for a multiplayer map, carrying the viewer id', async () => {
    const log: unknown[] = []
    const open = await presenceSession(deps(log)).open({ slug: 'compliance-hq', multiplayer: true })
    expect(log).toEqual([['connect', 'compliance-hq']])
    expect(open?.ownId).toBe('kc-1')
    // The viewer's own name rides the same bundle so MapScene can label the
    // local avatar (their own nameplate), not just the peers'.
    expect(open?.ownName).toBe('Ada Lovelace')
    // The peer-character lookup rides the same bundle (#266) — MapScene reads
    // it off the registry rather than importing a data service (ADR-0004).
    expect(open?.loadManifest).toBe(loadManifest)
  })

  it('opens nothing for a solo map', async () => {
    const log: unknown[] = []
    const open = await presenceSession(deps(log)).open({ slug: 'quiet-room', multiplayer: false })
    expect(log).toEqual([])
    expect(open).toBeNull()
  })

  it('opens nothing when the viewer is unknown', async () => {
    const log: unknown[] = []
    const open = await presenceSession(deps(log, null)).open({ slug: 'hq', multiplayer: true })
    expect(log).toEqual([])
    expect(open).toBeNull()
  })

  it('closes the previous room on an onward hop', async () => {
    const log: unknown[] = []
    const session = presenceSession(deps(log))
    await session.open({ slug: 'hq', multiplayer: true })
    await session.open({ slug: 'annexe', multiplayer: true })
    expect(log).toEqual([['connect', 'hq'], ['disconnect', 'hq'], ['connect', 'annexe']])
  })

  it('closes the room on exit, and stays closed on a second close', async () => {
    const log: unknown[] = []
    const session = presenceSession(deps(log))
    await session.open({ slug: 'hq', multiplayer: true })
    session.close()
    session.close()
    expect(log).toEqual([['connect', 'hq'], ['disconnect', 'hq']])
  })

  it('closes the previous room even when hopping to a solo map', async () => {
    const log: unknown[] = []
    const session = presenceSession(deps(log))
    await session.open({ slug: 'hq', multiplayer: true })
    await session.open({ slug: 'quiet-room', multiplayer: false })
    expect(log).toEqual([['connect', 'hq'], ['disconnect', 'hq']])
  })
})
