// In-memory auth-token store (issue #93). The HTTP layer reads the current
// access token from here and attaches it as `Authorization: Bearer <token>` to
// every API request; the dev user-switcher writes to it to "become" a seeded
// user without a login round-trip.
//
// Deliberately in-memory (not localStorage): a real OIDC flow (#79 follow-ups)
// will own token persistence/refresh. Keeping the store tiny and synchronous
// means callers — and the switcher — can subscribe and re-fetch on change.

let current: string | null = null
const listeners = new Set<() => void>()

export function getAuthToken(): string | null {
  return current
}

export function setAuthToken(token: string | null): void {
  current = token
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
