// The single source of truth for the per-target registry keys (#303). Both
// map-entry paths — MapPage's boot effect and PhaserGame.enterPortal — write
// through applyMapTarget, so a key added here reaches both and a dropped key
// fails this test rather than going blank via a portal only.

import { describe, expect, it } from 'vitest'
import { applyMapTarget } from './mapTarget.ts'

describe('applyMapTarget', () => {
  it('sets exactly the per-target registry keys, nothing else', () => {
    const calls: Record<string, unknown> = {}
    const S = [{ id: 1, x: 0, y: 0, message: 'hi', manifest: null }]
    applyMapTarget(
      { set: (k, v) => (calls[k] = v) },
      { map: 'M', objects: 'O', bakedNpcs: 'N', bakedStandees: S, entrySpawnId: 's', fromSlug: 'F', presence: 'P', voice: 'V' },
    )
    expect(calls).toEqual({
      bakedMap: 'M',
      bakedObjects: 'O',
      bakedNpcs: 'N',
      bakedStandees: S,
      entrySpawnId: 's',
      fromSlug: 'F',
      presence: 'P',
      voice: 'V',
    })
  })
})
