// Which Keycloak realm the user signs in through (#539). With an external
// clients realm configured, the app must know the realm BEFORE redirecting to
// Keycloak, so the choice is made on a pre-login chooser page and persisted —
// the OIDC redirect round-trip and later visits must re-init keycloak-js with
// the same realm or the callback fails.
//
// ponytail: feature-detect localStorage.getItem, not just the binding — Node 25
// ships an inert `localStorage` global (object, no methods) unless
// `--localstorage-file` is set, so the node test env has one that would throw.

import { REALM, EXTERNAL_REALM } from './config.ts'

const persist = typeof localStorage?.getItem === 'function'
const KEY = 'odtville.loginRealm'

// The realms the chooser offers, in display order.
export function loginRealms(): readonly { realm: string; label: string }[] {
  return [
    { realm: REALM, label: 'Continue with ODT SSO' },
    { realm: EXTERNAL_REALM, label: 'Continue with External' },
  ]
}

// The persisted choice, only if it is still one of the offered realms — a
// stale value (renamed realm) must fall back to the chooser, not a dead login.
export function chosenRealm(): string | null {
  const stored = persist ? localStorage.getItem(KEY) : null
  return stored && loginRealms().some((r) => r.realm === stored) ? stored : null
}

export function chooseRealm(realm: string): void {
  if (persist) localStorage.setItem(KEY, realm)
}

export function clearRealmChoice(): void {
  if (persist) localStorage.removeItem(KEY)
}
