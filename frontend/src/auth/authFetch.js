// fetch() wrapper that attaches the Keycloak bearer token and keeps it fresh.
//
// Every API client (communities, game-session, the inline /me call) goes
// through this so there is exactly one place that knows about tokens. When auth
// is disabled it degrades to a plain fetch.
import keycloak, { authEnabled } from './keycloak.js'

export async function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {})

  if (authEnabled && keycloak.authenticated) {
    // Refresh if the token expires within 30s; on failure send the user back
    // to the login page rather than firing an unauthenticated request.
    try {
      await keycloak.updateToken(30)
    } catch {
      keycloak.login()
    }
    if (keycloak.token) headers.set('Authorization', `Bearer ${keycloak.token}`)
  }

  return fetch(url, { ...options, headers })
}
