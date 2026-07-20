// Pins the preview-in-game handoff (#91): the decorate editor's current edits
// assemble into the same BakedMap document the play endpoint publishes, cross
// to the runtime via storage, and are re-validated through the schema on the
// way out — the handoff is the contract, never an import (ADR-0004).

import { describe, expect, it } from 'vitest'
import type { BakedMap } from '../kernel/schema.ts'
import { draftMap, stashDraft, takeDraft } from './draft.ts'

const loaded: BakedMap = {
  slug: 'grove',
  title: 'The Grove',
  cols: 2,
  rows: 1,
  tilesets: [],
  tiles: [],
  entities: [{ kind: 'prop', tileset: 'sheet', frame: 3, x: 0, y: 0 }],
  // The Node properties (#91, ADR-0005) ride the document like multiplayer.
  access_policy: { kind: 'claim', role: 'staff' },
  collision: [[true, false]],
  zones: [{ trigger: 'on_enter', x: 0, y: 0, payload: { kind: 'portal', targetNode: 'town' } }],
}

const edits = {
  entities: [{ kind: 'prop', object_id: 7, x: 1, y: 0 }],
  collision: [[false, true]],
  zones: [
    {
      trigger: 'on_sight' as const,
      facing: 'down' as const,
      x: 1,
      y: 0,
      payload: { kind: 'trainer' as const, npcId: 3 },
    },
  ],
}

function memoryStorage(): Storage {
  const mem = new Map<string, string>()
  return {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  } as Storage
}

describe('draftMap', () => {
  it('applies the current edits over the loaded document', () => {
    const doc = draftMap(loaded, edits.entities, edits.collision, edits.zones, true)
    expect(doc.entities).toEqual(edits.entities)
    expect(doc.collision).toEqual(edits.collision)
    expect(doc.zones).toEqual(edits.zones)
    expect(doc.multiplayer).toBe(true)
    expect(doc.slug).toBe('grove')
  })

  it('drops cleared layers even when the loaded document had them', () => {
    const doc = draftMap(loaded, [], null, [], false)
    expect(doc).not.toHaveProperty('collision')
    expect(doc).not.toHaveProperty('zones')
  })
})

describe('stash/take', () => {
  it('round-trips the draft through storage and the schema', () => {
    const storage = memoryStorage()
    const doc = draftMap(loaded, edits.entities, edits.collision, edits.zones, true)
    stashDraft(doc, storage)
    expect(takeDraft(storage)).toEqual(doc)
  })

  it('returns null when nothing is stashed', () => {
    expect(takeDraft(memoryStorage())).toBeNull()
  })

  it('rejects a stashed document that breaks the contract', () => {
    const storage = memoryStorage()
    storage.setItem('odt-ville:map-draft', JSON.stringify({ slug: 'x' }))
    expect(() => takeDraft(storage)).toThrow()
  })
})
