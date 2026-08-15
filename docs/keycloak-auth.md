# Keycloak auth — backend bearer-token verification

The backend trusts a **real Keycloak JWT** (issue #92, first slice of #79). The
`X-User-Id` stub is gone: every `/api/v1/*` request must carry a valid
`Authorization: Bearer <jwt>` whose signature checks out against the realm's
JWKS and whose `iss`/`aud`/`exp` claims are valid. The verified `sub` is matched
to a local `User` by its `external_id`.

## Moving parts

- **`keycloak` compose service** — `quay.io/keycloak/keycloak:26.0`, started with
  `start-dev --import-realm`, which re-imports `keycloak/realm-export.json` on
  every boot. The realm `odtville` ships a public client `odt-ville-web` with
  **Direct Access Grants** enabled and seeded users **alice/bob/carol**
  (password `dev`) pinned to fixed subject UUIDs.
- **`User#external_id`** — unique column linking a local user to a realm subject.
  `db/seeds.rb` seeds alice/bob/carol with the same pinned UUIDs as the realm.
- **`KeycloakAuthenticator`** — verifies the token (RS256 + JWKS, `iss`/`aud`/`exp`),
  caching the JWKS. `ApplicationController` resolves `current_user` from the
  bearer token and returns **401** on a missing/invalid/expired token.

The token's `iss` reflects the host the token was minted from
(`http://localhost:8080/realms/odtville`), so the backend validates `iss` against
that, but fetches the JWKS over the private compose network
(`http://keycloak:8080/...`) — same keys, no public round-trip
(`KEYCLOAK_ISSUER` / `KEYCLOAK_JWKS_URI` in `compose.yaml`).

## Frontend bearer + dev user switcher (issue #93)

The frontend attaches the access token to every API request and lets a developer
become any seeded user in one click:

- **`src/lib/authToken.ts`** — a tiny in-memory token store (`get`/`set`/
  `subscribe`). `src/lib/http.ts` reads it at send time and adds
  `Authorization: Bearer <token>` to each `/api/v1/*` request.
- **`src/auth/UserSwitcher.tsx`** — a **dev-only** control (rendered behind an
  `import.meta.env.DEV` gate in `RootLayout`) that runs a password grant against
  the realm (`src/auth/keycloak.ts`) and swaps the stored token. `RootLayout`
  subscribes to the store and re-fetches `/api/v1/me` on every swap, so the whole
  app re-renders as the chosen user. The gate tree-shakes the switcher and its
  keycloak client out of production builds.
- The realm origin defaults to `http://localhost:8080`; override with
  `VITE_KEYCLOAK_URL` when Keycloak lives elsewhere (e.g. a tunnel host).

Two browser windows on different seeded users now operate independently — the
substrate for presence/multiplayer testing.

## Manual verification

Bring the stack up locally (`docker compose up --build`; the override publishes
the backend on `localhost:3190` and Keycloak on `localhost:8080`), then:

```sh
# 1. Mint an access token for alice via the password grant (Direct Access Grants).
TOKEN=$(curl -s \
  -d "client_id=odt-ville-web" \
  -d "grant_type=password" \
  -d "username=alice" \
  -d "password=dev" \
  http://localhost:8080/realms/odtville/protocol/openid-connect/token \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Hit an authenticated endpoint with the bearer token → the matching user.
curl -s http://localhost:3190/api/v1/me -H "Authorization: Bearer $TOKEN"
#  => {"user":{"id":...,"name":"Alice Rivera",...},"company":{...}}

# 3. A garbage / missing token is rejected.
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:3190/api/v1/me -H "Authorization: Bearer garbage"   # => 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3190/api/v1/me  # => 401
```

Swap `username=bob` / `username=carol` to authenticate as the other seeded users.

## Admin roles: where they come from (#429–#432)

`current_roles` returns **the token's realm roles UNION the `auth_user_roles`
rows** for the signed-in user. Two sources, deliberately:

- **Realm role** (`admin` in the token) — the escape hatch. Locally that's
  alice, seeded by `keycloak/realm-export.json`. It cannot be revoked from
  `/admin/users`, so you cannot lock yourself out of your own dev stack.
- **App grant** (an `auth_user_roles` row) — the day-to-day tool. Granted and
  revoked at `/admin/users`, recorded with `granted_by`. It takes effect on the
  grantee's **next page load** — no re-login, because it never touches the token.

### Cold start: minting the first admin

Nobody can use `/admin/users` until someone is already an admin. On a fresh
environment, grant the first one directly:

```sh
docker compose exec backend ./bin/rails runner \
  'Auth::UserRole.find_or_create_by!(user: Auth::User.find_by!(email: "you@odds.team"), role: "admin")'
```

On the homeserver, prefix with the deploy overlay (`-f compose.yaml -f
compose.prod.yaml`) as `scripts/deploy-homeserver.sh` does. The user must have
logged in at least once — rows are JIT-provisioned on first login, so there is
nothing to grant to before that.

**Why this and not `kcadm`:** prod auth is the **org** Keycloak
(`https://sso.odd.works/realms/odt`, see `compose.prod.yaml`) — we do not
administer that realm, so realm roles are not ours to assign there. The DB grant
is the only bootstrap path we own. This is why #433 was closed as obsolete.

> Editing `keycloak/realm-export*.json` does **not** change a running Keycloak —
> the import only runs when the realm is absent. Locally, recreate the Keycloak
> volume to re-seed; in prod the realm is not ours to edit at all.
