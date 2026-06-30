// PostHog analytics (issue #101). One init at startup pointed at PostHog Cloud
// US; every event carries the logged-in user's email. Identity is derived from
// the Keycloak bearer JWT and kept in sync with the active user — including the
// dev UserSwitcher, which swaps tokens at runtime (subscribeAuthToken).
//
// Absent VITE_POSTHOG_KEY => init is a clean no-op, so dev/CI/tests stay quiet.

import posthog from 'posthog-js'

import { getAuthToken, subscribeAuthToken } from '../lib/authToken.ts'

const DEFAULT_HOST = 'https://us.i.posthog.com'

// The slice of posthog-js the identity wiring touches — narrow so it's unit-
// testable with a fake (the real posthog default export satisfies it).
export interface AnalyticsClient {
  identify(distinctId: string, props?: Record<string, unknown>): void
  register(props: Record<string, unknown>): void
  reset(): void
}

export interface UserClaims {
  sub: string
  email?: string
}

// Decode the `sub` + `email` claims from a bearer JWT (base64url payload).
// Returns null for a missing/malformed/sub-less token — "no identified user".
export function decodeUserClaims(token: string | null): UserClaims | null {
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof json.sub !== 'string') return null
    const email = typeof json.email === 'string' ? json.email : undefined
    return email ? { sub: json.sub, email } : { sub: json.sub }
  } catch {
    return null
  }
}

// Sync PostHog's identity with the active bearer token. reset() first so a dev
// user-switch drops the old person + super properties; then identify by the
// stable Keycloak `sub` and register email so it rides on every event.
export function identifyFromToken(
  client: AnalyticsClient,
  token: string | null,
): void {
  client.reset()
  const claims = decodeUserClaims(token)
  if (!claims) return
  client.identify(claims.sub, claims.email ? { email: claims.email } : undefined)
  if (claims.email) client.register({ email: claims.email })
}

// Initialise PostHog once and keep identity in sync with the active user.
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || DEFAULT_HOST,
  })
  identifyFromToken(posthog, getAuthToken())
  subscribeAuthToken(() => identifyFromToken(posthog, getAuthToken()))
}
