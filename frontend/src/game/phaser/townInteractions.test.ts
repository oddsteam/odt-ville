// The door as a Portal (#111, ADR-0005): a community with an authored interior
// Node makes its door travel instead of scene-starting the hardcoded
// InteriorScene. The payload is the same `portal` shape #84's travel dispatches.

import { describe, expect, it } from 'vitest'
import { interiorPortal } from './townInteractions.ts'

describe('interiorPortal', () => {
  it('builds the door portal payload for a community with an authored interior node', () => {
    expect(interiorPortal({ interior_node_slug: 'compliance-hq' })).toEqual({
      kind: 'portal',
      targetNode: 'compliance-hq',
      entrySpawnId: 'entry',
    })
  })

  it('is null without one — the v0 InteriorScene path', () => {
    expect(interiorPortal({})).toBeNull()
    expect(interiorPortal({ interior_node_slug: null })).toBeNull()
  })
})
