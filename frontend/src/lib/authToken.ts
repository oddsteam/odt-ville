// Auth-token store (issue #93). The HTTP layer reads the current access token
// from here and attaches it as `Authorization: Bearer <token>` to every API
// request; the dev user-switcher writes to it to "become" a seeded user without
// a login round-trip.
//
// In prod a real OIDC flow (keycloak-js) owns token persistence/refresh, so the
// store stays in-memory there. In DEV the switcher's token would otherwise die
// on every full page reload — or in a new tab (Preview in game opens one;
// sessionStorage is per-tab) — leaving the
// app unauthenticated and unable to reach the gated routes. So DEV-only we
// mirror it to localStorage and restore on load, keeping the switcher's
// "logged in" state across reloads.
// ponytail: DEV-only localStorage; feature-detect getItem, not just the binding
// — Node 25 ships an inert `localStorage` global (object, no methods) unless
// `--localstorage-file` is set, so the node test env has one that would throw.
const persist = import.meta.env.DEV && typeof localStorage?.getItem === 'function'
const KEY = 'odtville.devToken'

let current: string | null = persist ? localStorage.getItem(KEY) : null
const listeners = new Set<() => void>()

export function getAuthToken(): string | null {
  return current
}

export function setAuthToken(token: string | null): void {
  current = token
  if (persist) {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  }
  for (const listener of listeners) listener()
}

// Subscribe to token changes; returns an unsubscribe function. RootLayout uses
// this to re-fetch app state whenever the active user is swapped.
export function subscribeAuthToken(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
