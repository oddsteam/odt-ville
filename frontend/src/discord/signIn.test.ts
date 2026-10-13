import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAuthToken, setAuthToken } from '../lib/authToken'
import { signIn, type DiscordAuthSdk } from './signIn'

function fakeSdk(): DiscordAuthSdk & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    ready: async () => void calls.push('ready'),
    commands: {
      authorize: async (args) => {
        calls.push(`authorize:${args.client_id}:${args.scope.join(',')}`)
        return { code: 'code-1' }
      },
      authenticate: async ({ access_token }) => {
        calls.push(`authenticate:${access_token}`)
        return {}
      },
    },
  }
}

afterEach(() => setAuthToken(null))

describe('Discord sign-in (#568)', () => {
  it('trades the OAuth code for our session and stores the token', async () => {
    const sdk = fakeSdk()
    const fetchFn = vi.fn(async () =>
      Response.json({ token: 'dsc.abc', access_token: 'at-1', user: { name: 'Pim' } }),
    )

    const user = await signIn(sdk, 'app-1', fetchFn)

    expect(user.name).toBe('Pim')
    expect(getAuthToken()).toBe('dsc.abc')
    expect(sdk.calls).toEqual(['ready', 'authorize:app-1:identify', 'authenticate:at-1'])
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/discord/session')
    expect(JSON.parse(init.body as string)).toEqual({ code: 'code-1' })
  })

  it('throws (and stores nothing) when the backend rejects the code', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 401 }))

    await expect(signIn(fakeSdk(), 'app-1', fetchFn)).rejects.toThrow('401')
    expect(getAuthToken()).toBeNull()
  })
})
