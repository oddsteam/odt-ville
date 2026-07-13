// The decorate palette's grouping+search (#165): objects group under their
// free-form `kind` (new kinds → new sections, no code change) and a query
// filters by name or kind. Presentation (grid/collapse) is the component's job.

import { describe, expect, it } from 'vitest'
import { groupPalette } from './paletteGroups.ts'

const obj = (id: number, name: string, kind: string) => ({ id, name, kind }) as Parameters<typeof groupPalette>[0][number]
const items = [
  obj(1, 'Oak', 'prop'),
  obj(2, 'Town Hall', 'building'),
  obj(3, 'Rose', 'prop'),
  obj(4, 'Shop', 'building'),
]

describe('groupPalette', () => {
  it('groups by kind, preserving first-seen order of both kinds and objects', () => {
    expect(groupPalette(items, '')).toEqual([
      { kind: 'prop', objects: [items[0], items[2]] },
      { kind: 'building', objects: [items[1], items[3]] },
    ])
  })

  it('filters by name, case-insensitively, dropping now-empty kinds', () => {
    expect(groupPalette(items, 'rose')).toEqual([{ kind: 'prop', objects: [items[2]] }])
  })

  it('filters by kind too', () => {
    expect(groupPalette(items, 'building')).toEqual([
      { kind: 'building', objects: [items[1], items[3]] },
    ])
  })
})
