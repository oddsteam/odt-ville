import { describe, it, expect, beforeEach } from 'vitest'

import { startKeycloakSession } from './session.ts'
import { getAuthToken, setAuthToken } from '../lib/authToken.ts'

function fakeKeycloak(token: string) {
  const kc = {
    token,
    onTokenExpired: undefined as undefined | (() => void),
    async updateToken() {
      kc.token = 'refreshed-token'
      return true
    },
  }
  return kc
}

describe('startKeycloakSession', () => {
  beforeEach(() => setAuthToken(null))

  it('stores the access token on the shared bearer store', () => {
    startKeycloakSession(fakeKeycloak('initial-token'))
    expect(getAuthToken()).toBe('initial-token')
  })

  it('refreshes and re-stores the token when it expires', async () => {
    const kc = fakeKeycloak('initial-token')
    startKeycloakSession(kc)
    await kc.onTokenExpired!()
    expect(getAuthToken()).toBe('refreshed-token')
  })
})
