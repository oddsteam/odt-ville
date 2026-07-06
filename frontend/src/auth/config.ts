// Shared OIDC client config (issue #94). Used by both the dev password-grant
// client (keycloak.ts) and the prod redirect-login session (session.ts), kept
// in its own module so the prod path doesn't pull the dev client into the
// bundle. Override the Keycloak origin with VITE_KEYCLOAK_URL (e.g. a tunnel)
// and the realm with VITE_KEYCLOAK_REALM. Defaults target the local dev realm
// (`odtville`); prod builds set VITE_KEYCLOAK_REALM=odt for the org Keycloak.

export const REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'odtville'
export const CLIENT_ID = 'odt-ville-web'

export const KEYCLOAK_URL = (
  import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080'
).replace(/\/$/, '')
