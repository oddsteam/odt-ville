import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAuthToken } from '../lib/authToken'
import { guildMapSlug } from './guildMap'

afterEach(() => setAuthToken(null))

describe("the server's map (#569)", () => {
  it('asks the backend for the guild, signed in with our session', async () => {
    setAuthToken('dsc.abc')
    const fetchFn = vi.fn(async () => Response.json({ slug: 'office-ktb' }))

    expect(await guildMapSlug('111', fetchFn)).toBe('office-ktb')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/discord/guilds/111/map')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer dsc.abc')
  })

  it('an unregistered server is not set up (null)', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 404 }))

    expect(await guildMapSlug('999', fetchFn)).toBeNull()
  })

  it('outside a server (a DM Activity) is not set up, without a request', async () => {
    const fetchFn = vi.fn()

    expect(await guildMapSlug(null, fetchFn)).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('any other failure throws', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 500 }))

    await expect(guildMapSlug('111', fetchFn)).rejects.toThrow('500')
  })
})
