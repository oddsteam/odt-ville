import { describe, it, expect } from 'vitest'

import { redirectToAdminMapper, GROUND_MAPPER_ROUTE } from './adminRedirect.ts'

describe('redirectToAdminMapper', () => {
  it('bounces the retired standalone mapper to the admin-gated route', () => {
    const calls: string[] = []
    redirectToAdminMapper({ replace: (url) => calls.push(url) })

    // A non-admin who opens the old ground-mapper.html lands on /admin/ground,
    // where RequireAdmin (#100) turns them away — no ungated authoring (#162).
    expect(calls).toEqual([GROUND_MAPPER_ROUTE])
  })

  it('targets the admin console ground-tiles tab', () => {
    expect(GROUND_MAPPER_ROUTE).toBe('/admin/ground')
  })
})
