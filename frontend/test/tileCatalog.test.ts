import { describe, expect, it } from 'vitest'

import {
  HOMETOWN_CATALOG,
  edgeSetsFromCatalog,
  makeCatalog,
} from '../src/kernel/tileCatalog.ts'

describe('makeCatalog', () => {
  it('uses the terrain order as the priority stack (bottom -> top)', () => {
    const c = makeCatalog([{ type: 'road' }, { type: 'dirt' }, { type: 'grass' }])
    expect(c.stack).toEqual(['road', 'dirt', 'grass'])
  })

  it('collects only the autotiled terrains into the autotiled set', () => {
    const c = makeCatalog([
      { type: 'road' },
      { type: 'dirt', autotiled: true },
      { type: 'grass', autotiled: true },
    ])
    expect([...c.autotiled].sort()).toEqual(['dirt', 'grass'])
    expect(c.autotiled.has('road')).toBe(false)
  })
})

describe('HOMETOWN_CATALOG', () => {
  it('is the data equivalent of the old hardcoded constants', () => {
    expect(HOMETOWN_CATALOG.stack).toEqual(['road', 'dirt', 'grass'])
    expect([...HOMETOWN_CATALOG.autotiled].sort()).toEqual(['dirt', 'grass'])
  })
})

describe('edgeSetsFromCatalog', () => {
  it('keys edge/corner art by terrain then side, ignoring fill tiles', () => {
    const c = makeCatalog([{ type: 'grass' }], {
      tiles: [
        { tile_type: 'grass', tileset: 'S', col: 0, row: 0, role: 'fill', side: null },
        { tile_type: 'grass', tileset: 'S', col: 1, row: 0, role: 'edge', side: 'N' },
        { tile_type: 'grass', tileset: 'S', col: 2, row: 0, role: 'corner', side: 'NE' },
      ],
    })
    const sets = edgeSetsFromCatalog(c)
    expect(sets.grass).toEqual({ N: true, NE: true })
  })
})
