// AdminUsersService.grant — POST /admin/users/:id/roles (#431). Pins the
// request PATH and body the service builds, and that it decodes the updated
// roster row the server returns, so the page can flip the badge without a
// reload.

import { describe, expect, it } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'

import { Http, type HttpError } from '../src/lib/http.ts'
import { AdminUsersService } from '../src/auth/service.ts'

// Fake Http that records each POST (path + body) and answers with one updated
// roster row carrying a fresh App grant.
function recordingHttp(seen: Array<{ path: string; body: unknown }>) {
  const post = (path: string, body?: unknown): Effect.Effect<unknown, HttpError> => {
    seen.push({ path, body })
    return Effect.succeed({
      id: 7,
      name: 'Tara Target',
      email: 'tara@example.test',
      roles: [{ role: 'admin', source: 'app', granted_by: 'Test Admin', granted_at: '2026-08-15T00:00:00Z' }],
    })
  }
  const client = { get: post, post, put: post, patch: post, del: post }
  return Layer.succeed(Http, client as never)
}

const run = (seen: Array<{ path: string; body: unknown }> = []) =>
  Effect.runPromiseExit(Effect.provide(AdminUsersService.grant(7, 'admin'), recordingHttp(seen)))

describe('AdminUsersService.grant', () => {
  it('posts the role to the user roles collection', async () => {
    const seen: Array<{ path: string; body: unknown }> = []
    const exit = await run(seen)
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(seen).toEqual([{ path: '/admin/users/7/roles', body: { role: 'admin' } }])
  })

  it('decodes the updated roster row so the badge can flip in place', async () => {
    const exit = await run()
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.roles[0]).toMatchObject({ role: 'admin', source: 'app', granted_by: 'Test Admin' })
    }
  })
})
