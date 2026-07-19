// The village shell's zone dispatch (#249): the reserved `town` target is the
// interior's exit, every other target is an onward hop to that Node.

import { describe, expect, it } from 'vitest'
import { villageZone } from './villageZone.ts'
import type { Zone } from '../../kernel/schema.ts'

const zone = (payload: Zone['payload']): Zone => ({ trigger: 'on_enter', x: 0, y: 0, payload })

function spyDeps() {
  const calls: unknown[] = []
  return {
    calls,
    deps: {
      exitToTown: () => calls.push(['exit']),
      travel: (p: { targetNode: string; entrySpawnId?: string }) =>
        calls.push(['travel', p.targetNode, p.entrySpawnId]),
      openLink: (url: string) => calls.push(['link', url]),
      startDuel: (npcId: number) => calls.push(['duel', npcId]),
      startEncounter: (pool: string) => calls.push(['encounter', pool]),
    },
  }
}

describe('villageZone', () => {
  it('travels onward to another authored Node at its entry spawn', () => {
    const { calls, deps } = spyDeps()
    villageZone(deps)('on_enter', zone({ kind: 'portal', targetNode: 'atrium', entrySpawnId: 'from-hq' }))
    expect(calls).toEqual([['travel', 'atrium', 'from-hq']])
  })

  it('exits to the town hub on the reserved town target', () => {
    const { calls, deps } = spyDeps()
    villageZone(deps)('on_enter', zone({ kind: 'portal', targetNode: 'town' }))
    expect(calls).toEqual([['exit']])
  })

  it('opens a link payload without travelling', () => {
    const { calls, deps } = spyDeps()
    villageZone(deps)('on_enter', zone({ kind: 'link', url: 'https://example.test' }))
    expect(calls).toEqual([['link', 'https://example.test']])
  })

  it('starts a duel with the NPC a trainer payload names (#259)', () => {
    const { calls, deps } = spyDeps()
    villageZone(deps)('on_sight', { trigger: 'on_sight', x: 0, y: 0, facing: 'down', payload: { kind: 'trainer', npcId: 7 } })
    expect(calls).toEqual([['duel', 7]])
  })

  // The bug this guards: #259 wired `trainer` into both this dispatch and
  // MapPage's, but #87 wired `encounter` into MapPage only — so the same map
  // rolled a wild on /maps/:slug and silently did nothing behind a community
  // door. The event fired, the switch matched no case, and nothing threw.
  it('rolls a wild from the pool an encounter payload names (#87)', () => {
    const { calls, deps } = spyDeps()
    villageZone(deps)('on_enter', zone({ kind: 'encounter', pool: 'hometown-wild' }))
    expect(calls).toEqual([['encounter', 'hometown-wild']])
  })

  it('treats an empty pool slug as the global pool', () => {
    const { calls, deps } = spyDeps()
    villageZone(deps)('on_enter', zone({ kind: 'encounter', pool: '' }))
    expect(calls).toEqual([['encounter', '']])
  })
})
