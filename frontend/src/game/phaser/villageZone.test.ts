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
})
