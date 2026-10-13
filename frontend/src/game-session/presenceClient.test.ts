// The presence wire through Discord's URL mapping (#570): the Activity iframe
// may only reach its own proxied origin, so the cable URL must stay a
// same-origin relative path, and it carries whatever token sign-in stored —
// the `dsc.` session in the Discord shell, a Keycloak JWT on the web.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAuthToken } from '../lib/authToken.ts'

const createConsumer = vi.fn((_url: string) => ({
  subscriptions: { create: () => ({ perform: () => {} }) },
  disconnect: () => {},
}))
vi.mock('@rails/actioncable', () => ({ createConsumer: (url: string) => createConsumer(url) }))

const { connectPresence } = await import('./presenceClient.ts')

afterEach(() => {
  setAuthToken(null)
  createConsumer.mockClear()
})

describe('connectPresence', () => {
  it('opens a same-origin cable authenticated with the stored session token', () => {
    setAuthToken('dsc.a+b/c=')

    expect(connectPresence('office-ktb')).not.toBeNull()
    expect(createConsumer).toHaveBeenCalledWith('/api/cable?token=dsc.a%2Bb%2Fc%3D')
  })

  it('stays offline with no signed-in token', () => {
    expect(connectPresence('office-ktb')).toBeNull()
    expect(createConsumer).not.toHaveBeenCalled()
  })
})
