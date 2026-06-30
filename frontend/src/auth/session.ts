// Real interactive OIDC login (issue #94). The PROD path: redirect to Keycloak,
// then keep the in-memory bearer token fresh. The DEV path uses the one-click
// user switcher (keycloak.ts) instead, so bootstrapAuth() is a no-op there —
// the two coexist cleanly (AC4 of #94).

import Keycloak from 'keycloak-js'

import { setAuthToken } from '../lib/authToken.ts'
import { REALM, CLIENT_ID, KEYCLOAK_URL } from './config.ts'

// The slice of keycloak-js we depend on — narrow so the refresh wiring is
// unit-testable with a fake (the real Keycloak instance satisfies it).
export interface KeycloakSession {
  token?: string
  onTokenExpired?: () => void
  updateToken(minValidity: number): Promise<boolean>
}

// Publish the current access token, and refresh it as it expires.
export function startKeycloakSession(kc: KeycloakSession): void {
  setAuthToken(kc.token ?? null)
  kc.onTokenExpired = () =>
    kc
      .updateToken(30)
      .then(() => setAuthToken(kc.token ?? null))
      .catch(() => setAuthToken(null))
}

// Sign the user in before the app renders. DEV: skip — the switcher owns tokens.
// PROD: force a redirect login, then start the refresh loop.
export async function bootstrapAuth(): Promise<void> {
  if (import.meta.env.DEV) return

  const kc = new Keycloak({ url: KEYCLOAK_URL, realm: REALM, clientId: CLIENT_ID })
  await kc.init({ onLoad: 'login-required', checkLoginIframe: false })
  startKeycloakSession(kc)
}
