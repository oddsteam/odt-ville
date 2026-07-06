# OIDC client request for ODT-Ville

**To:** Org Keycloak admin
**App:** ODT-Ville — https://odt-ville.p2d.uk
**Goal:** Move authentication from our own Keycloak onto the org Keycloak so all org members can sign in.

We have a Rails API + React SPA that currently authenticates against our own Keycloak.
Please create **one OpenID Connect client** with the settings below.

---

## 1. Client configuration

| Setting | Value |
|---|---|
| Protocol | `openid-connect` |
| Client ID | `odt-ville-web` *(preferred — it's currently hardcoded on our side; if you must use a different ID, tell us the value and we'll update our config)* |
| Client type | **Public** (browser SPA using `keycloak-js` — no client secret) |
| Standard flow (Authorization Code) | **Enabled** |
| PKCE | **S256** (recommended for a public SPA) |
| Direct access grants | **Disabled** |
| Implicit flow | **Disabled** |
| Valid redirect URIs | `https://odt-ville.p2d.uk/*` |
| Web origins | `https://odt-ville.p2d.uk` |
| Valid post-logout redirect URIs | `https://odt-ville.p2d.uk` and `https://odt-ville.p2d.uk/*` *(we log out back to the site root)* |

---

## 2. Audience mapper — **important gotcha**

Our backend verifies the access token's `aud` claim equals **`odt-ville-web`** and rejects the
token otherwise. A public client's tokens don't carry this by default, so please add an
**Audience** protocol mapper on the client:

- Mapper type: **Audience**
- Included Client Audience: `odt-ville-web`
- Add to access token: **ON**

---

## 3. Roles

The app has an admin area gated on a role literally named **`admin`**. Our backend accepts it as
either a **realm role** `admin` *or* a **client role** `admin` on `odt-ville-web` (it merges
`realm_access.roles` and `resource_access["odt-ville-web"].roles`). Please:

- Create an `admin` role (realm or client role — your preference), and
- Assign it to whoever should reach the admin console. Everyone else just needs to be a normal realm user.

---

## 4. Token claims we read

The access token must include these claims (standard scopes usually cover them):

- `sub` — user identity (required)
- `email` — **required**; we provision/link the local user by email on first login
- `realm_access.roles` / `resource_access.odt-ville-web.roles` — for the `admin` gate
- `groups` — optional, read if present

---

## 5. What we need back from you

- The **issuer URL** — i.e. `https://<org-keycloak-host>/realms/<realm-name>`
- The **realm name**
- The **public Keycloak base URL** (must be reachable from our backend server so it can fetch
  the JWKS at `/realms/<realm>/protocol/openid-connect/certs`)
- Confirmation of the final **Client ID** if it isn't `odt-ville-web`

---

## Appendix — changes on our side (for our team, not the admin)

Config-only changes once the admin replies:

- **Frontend** (`frontend/src/auth/config.ts`): `REALM` and `CLIENT_ID` are hardcoded to
  `odtville` / `odt-ville-web`. If the org realm/client differ, update these. Set build-time env
  `VITE_KEYCLOAK_URL` to the org Keycloak base URL.
- **Backend** env: `KEYCLOAK_ISSUER` = the org issuer URL, `KEYCLOAK_AUDIENCE` = the final client
  ID, optionally `KEYCLOAK_JWKS_URI` if the JWKS isn't at the default path.
- Retire the local `keycloak` container from `compose.prod.yaml` and the `odt-ville-auth.p2d.uk`
  tunnel once we're on org Keycloak.
- **Access gate:** `application_controller.rb` auto-provisions users only for emails in
  `odds.team` / `odt.co.th` (`ALLOWED_SIGNUP_DOMAINS`, issue #97). On the org Keycloak we'll need
  to widen or drop this so valid org members aren't blocked.
