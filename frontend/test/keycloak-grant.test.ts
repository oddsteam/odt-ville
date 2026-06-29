import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { passwordGrant, switchUser, DEV_USERS } from '../src/auth/keycloak.ts'
import { getAuthToken, setAuthToken } from '../src/lib/authToken.ts'

describe('keycloak password grant', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => {
    setAuthToken(null)
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('seeds the three realm dev users', () => {
    expect(DEV_USERS.map((u) => u.username)).toEqual(['alice', 'bob', 'carol'])
  })

  it('posts a form-encoded password grant and returns the access token', async () => {
    const f = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ access_token: 'tok-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    globalThis.fetch = f as unknown as typeof fetch

    const token = await passwordGrant('alice', 'dev')
    expect(token).toBe('tok-123')

    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toContain('/realms/odtville/protocol/openid-connect/token')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    const body = new URLSearchParams(init?.body as string)
    expect(body.get('grant_type')).toBe('password')
    expect(body.get('client_id')).toBe('odt-ville-web')
    expect(body.get('username')).toBe('alice')
    expect(body.get('password')).toBe('dev')
  })

  it('throws on a non-2xx token response', async () => {
    globalThis.fetch = (async () =>
      new Response('nope', { status: 401 })) as unknown as typeof fetch
    await expect(passwordGrant('alice', 'wrong')).rejects.toThrow()
  })

  it('switchUser grants a token and stores it', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ access_token: 'bob-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch

    await switchUser('bob')
    expect(getAuthToken()).toBe('bob-token')
  })
})
