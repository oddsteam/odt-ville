// Portal travel (#84): the gate before leaving the current map. Travel only
// proceeds when the target map actually loads — a denied (403) or failed load
// refuses with a reason and the avatar stays put, so the portal is never a
// trapdoor onto an error page.

import { describe, expect, it } from 'vitest'
import { travel } from './travel.ts'

describe('travel', () => {
  it('goes to the target with its entry spawn when the load succeeds', async () => {
    const calls: unknown[] = []
    await travel(
      { kind: 'portal', targetNode: 'plaza', entrySpawnId: 'from-atrium' },
      {
        load: async () => ({}),
        go: (slug, spawn) => calls.push(['go', slug, spawn]),
        refuse: (n) => calls.push(['refuse', n]),
      },
    )
    expect(calls).toEqual([['go', 'plaza', 'from-atrium']])
  })

  it('refuses a denied map with an access reason and does not go', async () => {
    const calls: unknown[] = []
    await travel(
      { kind: 'portal', targetNode: 'vault' },
      {
        load: async () => {
          throw Object.assign(new Error('request to /maps/vault failed with status 403'), {
            status: 403,
          })
        },
        go: (slug) => calls.push(['go', slug]),
        refuse: (n) => calls.push(['refuse', n]),
      },
    )
    expect(calls).toEqual([['refuse', 'ENTRY REFUSED — you don’t have access to "vault"']])
  })

  it('refuses on any other load failure with the error itself as the reason', async () => {
    const calls: unknown[] = []
    await travel(
      { kind: 'portal', targetNode: 'plaza' },
      {
        load: async () => {
          throw new Error('network down')
        },
        go: (slug) => calls.push(['go', slug]),
        refuse: (n) => calls.push(['refuse', n]),
      },
    )
    expect(calls).toEqual([['refuse', 'ENTRY REFUSED — network down']])
  })
})
