// Keycloak Direct-Access-Grant client (issue #93, slice 2 of #79).
//
// This is the DEV path: the realm's `odt-ville-web` public client has Direct
// Access Grants enabled and ships seeded users alice/bob/carol (password `dev`).
// Exchanging username+password for an access token here lets a developer
// "become" any seeded user in one click — no interactive login. A real
// browser-redirect OIDC flow replaces this for production in a later slice.

import { setAuthToken } from '../lib/authToken.ts'

const CLIENT_ID = 'odt-ville-web'
const REALM = 'odtville'

// Keycloak's public origin. Defaults to the compose-published port; override
// with VITE_KEYCLOAK_URL when the realm lives elsewhere (e.g. a tunnel host).
const KEYCLOAK_URL = (
  import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080'
).replace(/\/$/, '')

const TOKEN_ENDPOINT = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`

export interface DevUser {
  readonly username: string
  readonly label: string
}

// The seeded realm users (keycloak/realm-export.json), all with password `dev`.
export const DEV_USERS: readonly DevUser[] = [
  { username: 'alice', label: 'Alice Rivera' },
  { username: 'bob', label: 'Bob Chen' },
  { username: 'carol', label: 'Carol Diaz' },
] as const

export const DEV_PASSWORD = 'dev'

// Exchange credentials for an access token via the password grant. Throws on a
// non-2xx response or a body without an access_token.
export async function passwordGrant(
  username: string,
  password: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'password',
    username,
    password,
  })

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Keycloak token request failed (${res.status})${detail ? `: ${detail}` : ''}`,
    )
  }

  const json = (await res.json()) as { access_token?: unknown }
  if (typeof json.access_token !== 'string') {
    throw new Error('Keycloak token response missing access_token')
  }
  return json.access_token
}

// Become a seeded dev user: grant a fresh token and store it. The HTTP layer
// reads the new token on the next request; subscribers (RootLayout) re-fetch.
export async function switchUser(username: string): Promise<void> {
  const token = await passwordGrant(username, DEV_PASSWORD)
  setAuthToken(token)
}
