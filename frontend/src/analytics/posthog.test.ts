import { describe, it, expect, vi } from 'vitest'

import {
  decodeUserClaims,
  identifyFromToken,
  type AnalyticsClient,
} from './posthog.ts'

// A JWT is header.payload.signature; only the base64 payload matters here.
function jwt(payload: object): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`
}

describe('decodeUserClaims', () => {
  it('pulls sub and email from a bearer JWT', () => {
    expect(decodeUserClaims(jwt({ sub: 'u-1', email: 'a@odds.team' }))).toEqual({
      sub: 'u-1',
      email: 'a@odds.team',
    })
  })

  it('keeps sub when email is absent', () => {
    expect(decodeUserClaims(jwt({ sub: 'u-1' }))).toEqual({ sub: 'u-1' })
  })

  it('returns null for a null, malformed, or sub-less token', () => {
    expect(decodeUserClaims(null)).toBeNull()
    expect(decodeUserClaims('not-a-jwt')).toBeNull()
    expect(decodeUserClaims(jwt({ email: 'a@odds.team' }))).toBeNull()
  })
})

function fakeClient(): AnalyticsClient {
  return { identify: vi.fn(), register: vi.fn(), reset: vi.fn() }
}

describe('identifyFromToken', () => {
  it('identifies by sub and registers email as a super property', () => {
    const c = fakeClient()
    identifyFromToken(c, jwt({ sub: 'u-1', email: 'a@odds.team' }))
    expect(c.reset).toHaveBeenCalled()
    expect(c.identify).toHaveBeenCalledWith('u-1', { email: 'a@odds.team' })
    expect(c.register).toHaveBeenCalledWith({ email: 'a@odds.team' })
  })

  it('resets only when there is no usable token', () => {
    const c = fakeClient()
    identifyFromToken(c, null)
    expect(c.reset).toHaveBeenCalled()
    expect(c.identify).not.toHaveBeenCalled()
    expect(c.register).not.toHaveBeenCalled()
  })

  it('re-identifies as the new user on a switch', () => {
    const c = fakeClient()
    identifyFromToken(c, jwt({ sub: 'u-1', email: 'a@odds.team' }))
    identifyFromToken(c, jwt({ sub: 'u-2', email: 'b@odds.team' }))
    expect(c.reset).toHaveBeenCalledTimes(2)
    expect(c.identify).toHaveBeenLastCalledWith('u-2', { email: 'b@odds.team' })
    expect(c.register).toHaveBeenLastCalledWith({ email: 'b@odds.team' })
  })
})
