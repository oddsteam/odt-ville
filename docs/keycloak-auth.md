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
