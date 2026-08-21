// AdminUsersService.grant / revoke — POST and DELETE /admin/users/:id/roles
// (#431/#432). Pins the request PATH (and body, for grant) the service builds,
// and that it decodes the updated roster row the server returns, so the page can
// flip the badge without a reload.

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
      external: null,
      client_site: null,
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

// Fake Http answering a revoke with the demoted row (no roles left), recording
// each DELETE path.
function revokingHttp(seen: Array<{ path: string }>) {
  const del = (path: string): Effect.Effect<unknown, HttpError> => {
    seen.push({ path })
    return Effect.succeed({
      id: 7, name: 'Tara Target', email: 'tara@example.test',
      external: null, client_site: null, roles: [],
    })
  }
  const client = { get: del, post: del, put: del, patch: del, del }
  return Layer.succeed(Http, client as never)
}

describe('AdminUsersService.revoke', () => {
  it('deletes the role from the user roles collection and decodes the demoted row', async () => {
    const seen: Array<{ path: string }> = []
    const exit = await Effect.runPromiseExit(
      Effect.provide(AdminUsersService.revoke(7, 'admin'), revokingHttp(seen)),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(seen).toEqual([{ path: '/admin/users/7/roles/admin' }])
    if (Exit.isSuccess(exit)) expect(exit.value.roles).toEqual([])
  })
})

// Fake Http recording each write (path + body), answering with a created/updated
// Client row so the console can splice it in without a reload (#500).
function writingHttp(seen: Array<{ path: string; body: unknown }>) {
  const write = (path: string, body?: unknown): Effect.Effect<unknown, HttpError> => {
    seen.push({ path, body })
    return Effect.succeed({
      id: 9, name: 'new.client', email: 'new.client@client.test',
      external: true, client_site: 'KTB', roles: [],
    })
  }
  const client = { get: write, post: write, put: write, patch: write, del: write }
  return Layer.succeed(Http, client as never)
}

describe('AdminUsersService.create', () => {
  it('posts the pre-provision body to the users collection and decodes the row', async () => {
    const seen: Array<{ path: string; body: unknown }> = []
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        AdminUsersService.create({ email: 'new.client@client.test', external: true, client_site: 'KTB' }),
        writingHttp(seen),
      ),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(seen).toEqual([
      { path: '/admin/users', body: { email: 'new.client@client.test', external: true, client_site: 'KTB' } },
    ])
    if (Exit.isSuccess(exit)) expect(exit.value.client_site).toBe('KTB')
  })
})

describe('AdminUsersService.update', () => {
  it('patches external and client_site on an existing user and decodes the row', async () => {
    const seen: Array<{ path: string; body: unknown }> = []
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        AdminUsersService.update(9, { external: true, client_site: 'KTB' }),
        writingHttp(seen),
      ),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(seen).toEqual([{ path: '/admin/users/9', body: { external: true, client_site: 'KTB' } }])
    if (Exit.isSuccess(exit)) expect(exit.value.external).toBe(true)
  })
})
