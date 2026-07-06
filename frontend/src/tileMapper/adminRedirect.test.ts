import { describe, it, expect } from 'vitest'

import { redirectToAdminMapper, TILE_MAPPER_ROUTE } from './adminRedirect.ts'

describe('redirectToAdminMapper', () => {
  it('bounces the retired standalone tile-object mapper to the admin-gated route', () => {
    const calls: string[] = []
    redirectToAdminMapper({ replace: (url) => calls.push(url) })

    // A non-admin who opens the old tile-mapper.html lands on /admin/objects,
    // where RequireAdmin (#100) turns them away — no ungated authoring (#161).
    expect(calls).toEqual([TILE_MAPPER_ROUTE])
  })

  it('targets the admin console objects tab', () => {
    expect(TILE_MAPPER_ROUTE).toBe('/admin/objects')
  })
})
