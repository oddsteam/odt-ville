// Real interactive OIDC login (issue #94). The PROD path: redirect to Keycloak,
// then keep the in-memory bearer token fresh. The DEV path uses the one-click
// user switcher (keycloak.ts) instead, so bootstrapAuth() is a no-op there —
// the two coexist cleanly (AC4 of #94).

import Keycloak from 'keycloak-js'

import { setAuthToken } from '../lib/authToken.ts'
import { REALM, EXTERNAL_REALM, CLIENT_ID, KEYCLOAK_URL } from './config.ts'
import { chosenRealm, clearRealmChoice } from './realmChoice.ts'

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

// The live Keycloak instance in PROD (null in DEV, where the switcher owns the
// token) — kept so logout() can end the session it started.
let keycloak: Keycloak | null = null

// Sign the user in before the app renders. DEV: skip — the switcher owns tokens.
// PROD: force a redirect login, then start the refresh loop. With an external
// realm configured (#539) the realm must be picked before the redirect, so an
// unmade choice short-circuits to 'choose' and main.tsx renders the chooser.
export async function bootstrapAuth(): Promise<'ready' | 'choose'> {
  if (import.meta.env.DEV) return 'ready'

  let realm = REALM
  if (EXTERNAL_REALM) {
    const chosen = chosenRealm()
    if (!chosen) return 'choose'
    realm = chosen
  }

  keycloak = new Keycloak({ url: KEYCLOAK_URL, realm, clientId: CLIENT_ID })
  await keycloak.init({ onLoad: 'login-required', checkLoginIframe: false })
  startKeycloakSession(keycloak)
  return 'ready'
}

// Sign out from both paths. Always drop the bearer (clears the persisted dev
// token too). PROD: end the Keycloak session and bounce back to the village via
// its login. DEV: reload home — the switcher logs back in.
export function logout(): void {
  setAuthToken(null)
  clearRealmChoice()
  if (keycloak) {
    keycloak.logout({ redirectUri: window.location.origin })
  } else if (typeof window !== 'undefined') {
    window.location.assign('/')
  }
}
