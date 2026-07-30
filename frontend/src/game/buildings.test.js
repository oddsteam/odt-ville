import { describe, expect, it } from 'vitest'

import { buildingObjectFor } from './buildings.js'

// The #292 resolution order: per-community assigned object → active
// 'building' object → null (bundled art).
describe('buildingObjectFor', () => {
  const assigned = { id: 7, image: 'data:7' }
  const active = { id: 3, image: 'data:3' }

  it('prefers the community-assigned object', () => {
    expect(buildingObjectFor({ tile_object_id: 7 }, { 7: assigned }, active)).toBe(assigned)
  })

  it('falls back to the active object on a dangling id', () => {
    expect(buildingObjectFor({ tile_object_id: 99 }, { 7: assigned }, active)).toBe(active)
  })

  it('uses the active object when nothing is assigned', () => {
    expect(buildingObjectFor({}, {}, active)).toBe(active)
  })

  it('resolves to null (bundled art) when neither exists', () => {
    expect(buildingObjectFor({ tile_object_id: null }, {}, null)).toBeNull()
  })
})
