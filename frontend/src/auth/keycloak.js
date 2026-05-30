// Keycloak client for the ODT Village POC.
//
// All connection details are env-driven (Vite `VITE_*` vars), so pointing the
// app at ODT's real company Keycloak later is a config change — no code edit:
//
//   VITE_KEYCLOAK_URL=https://keycloak.odt.example
//   VITE_KEYCLOAK_REALM=odt-corp
//   VITE_KEYCLOAK_CLIENT_ID=odt-village
//
// Auth is ON by default. Set VITE_AUTH_DISABLED=true to run the original
// single-player, no-login mode (used by e2e and quick local runs without
// Keycloak up). In that mode the backend falls back to the seeded user.
import Keycloak from 'keycloak-js'

export const authEnabled = import.meta.env.VITE_AUTH_DISABLED !== 'true'

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8180',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'odt',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'odt-frontend',
})

export default keycloak
