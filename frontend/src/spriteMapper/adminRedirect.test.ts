import { describe, it, expect } from 'vitest'

import { redirectToAdminMapper, SPRITE_MAPPER_ROUTE } from './adminRedirect.ts'

describe('redirectToAdminMapper', () => {
  it('bounces the retired standalone mapper to the admin-gated route', () => {
    const calls: string[] = []
    redirectToAdminMapper({ replace: (url) => calls.push(url) })

    // A non-admin who opens the old sprite-mapper.html lands on /admin/sprites,
    // where RequireAdmin (#100) turns them away — no ungated authoring (#154).
    expect(calls).toEqual([SPRITE_MAPPER_ROUTE])
  })

  it('targets the admin console mapper tab', () => {
    expect(SPRITE_MAPPER_ROUTE).toBe('/admin/sprites')
  })
})
