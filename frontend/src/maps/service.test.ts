// Pins the decorate PATCH body (#139, ADR-0008): collision mask + placed props
// as full desired state — object references only, no image copies, no tileset
// union — while preserving entities the decorate editor doesn't manage.

import { describe, expect, it } from 'vitest'
import { decorationsBaked } from './service.ts'
import type { PlacedProp } from './props.ts'

describe('decorationsBaked', () => {
  it('carries the mask and bakes props as object references', () => {
    const props: PlacedProp[] = [{ object_id: 7, x: 0, y: 0 }]
    const b = decorationsBaked([[true]], props, [])
    expect(b).toEqual({
      collision: [[true]],
      entities: [{ kind: 'prop', object_id: 7, x: 0, y: 0 }],
    })
  })

  it('preserves entities it does not manage (legacy tileset/frame props)', () => {
    const legacy = [{ kind: 'prop', tileset: 'sheet', frame: 41, x: 0, y: 0 }]
    const b = decorationsBaked(null, [{ object_id: 7, x: 1, y: 1 }], legacy)
    expect(b.entities).toEqual([
      { kind: 'prop', tileset: 'sheet', frame: 41, x: 0, y: 0 },
      { kind: 'prop', object_id: 7, x: 1, y: 1 },
    ])
  })

  it('sends empty layers so the backend drops the keys', () => {
    const b = decorationsBaked(null, [], [])
    expect(b).toEqual({ collision: null, entities: [] })
  })
})
