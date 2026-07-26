# Basecamp avatars: an OAuth app on the server, served through our own proxy path

ODT Ville wants real faces (#318 epic). Basecamp already holds them — every
person in `GET /people.json` carries an `avatar_url`, and the org's Basecamp
account is the roster of record. Nothing else we have knows what anyone looks
like.

Two facts about that field decide most of this ADR:

- **`avatar_url` is a rotating signed capability token, not an address.** It
  302s to a CDN object and the signature changes whenever the person's
  `updated_at` moves. Hand it to the browser and you have published a
  credential with an unknown expiry; broadcast it in a presence frame and you
  have published it to every peer in the room, repeatedly.
- **Basecamp rejects anonymous-looking traffic.** A request without a
  `User-Agent` naming the app and a reachable contact address is refused
  outright, regardless of the token.

## Decision

### Auth: an OAuth 2 web-server app, refresh token in env

The org registered a Basecamp OAuth 2 app (`odt`, redirect
`https://odt-ville.p2d.uk/oauth`) rather than using a personal access token. A
personal token is bound to one human's account and dies with their membership;
the app's grant is the org's.

The sync is headless, so it does not run the authorization dance — it runs the
**refresh** half only. `Basecamp::Client` turns a stored refresh token into a
short-lived access token (~2 weeks) at the start of a run and reuses it for
every request in that run. Refresh tokens do not expire. Four values live in
the homeserver's gitignored `.env`, declared as `${...}` substitutions in
`compose.yaml`, exactly as `LIVEKIT_API_*` are:

```
BASECAMP_CLIENT_ID=…
BASECAMP_CLIENT_SECRET=…
BASECAMP_REFRESH_TOKEN=…
BASECAMP_ACCOUNT_ID=…
```

None of them may ever gain a `VITE_` prefix. Absent credentials mean no sync,
not an error — users keep the fallback avatar.

**Producing the refresh token is a one-time human step.** It needs a browser,
so no task can do it:

1. Open DevTools → Network → tick **Preserve log** first. Then open
   `https://launchpad.37signals.com/authorization/new?type=web_server&client_id=<CLIENT_ID>&redirect_uri=https://odt-ville.p2d.uk/oauth`
   and approve. Basecamp redirects to `/oauth?code=…`, which matches the SPA's
   catch-all route (`App.tsx`, `path="*"` → `<Navigate to="/" replace />`), so
   the code never survives in the address bar — read it off the `oauth?code=…`
   row in the network log instead. That is why Preserve log goes on first.

   A real `/oauth` callback route would make this one copy-paste easier and
   would then be a route we maintain forever for a thing done once per token
   lifetime. The network log is the cheaper side of that trade.
2. Exchange it (the code is single-use and expires in minutes):
   ```
   curl -X POST "https://launchpad.37signals.com/authorization/token?type=web_server&client_id=<CLIENT_ID>&redirect_uri=https://odt-ville.p2d.uk/oauth&client_secret=<CLIENT_SECRET>&code=<CODE>"
   ```
   Keep `refresh_token` from the response.
3. Find the account id:
   ```
   curl -H "Authorization: Bearer <ACCESS_TOKEN>" -H "User-Agent: ODT Ville (zacrify1986@gmail.com)" \
     https://launchpad.37signals.com/authorization.json
   ```
   `accounts[].id` for the Basecamp 5 product is `BASECAMP_ACCOUNT_ID`; it
   pins the API base to `https://3.basecampapi.com/<id>/`.

The hop was run on 2026-07-26: the app is authorized against account
**ODDS-TEAM** (`bc3`), and `people.json` answers. The refresh token 37signals
issued is dated to 2036, so this is a decade-scale credential — treat it like
`LIVEKIT_API_SECRET`, not like a session.

### User-Agent: `ODT Ville (zacrify1986@gmail.com)`

Sent on every request including the token refresh, overridable via
`BASECAMP_USER_AGENT` so the contact address can change without a deploy of
new code. Change it when ownership moves — 37signals mails that address before
they rate-limit or block.

### Rate limit: 50 requests / 10s per token

Not a constraint worth engineering against. A periodic roster sync over an org
of this size is a handful of paginated requests. If it ever isn't, throttle
then; a pre-emptive limiter is a bug farm guarding a limit we never approach.

### Serving: a stable path keyed by `external_id`, proxied on read

The browser and the peer characters get:

```
GET /api/v1/users/<external_id>/avatar
```

`external_id` is the Keycloak subject presence frames already carry (#88), so
**presence needs no new field** and peers (#5) point at the same path the
header (#320) does. The path is stable across avatar rotations — it is our
name for "this person's face", not Basecamp's.

Behind it, **proxy rather than mirror**: `users.avatar_url` stores Basecamp's
URL server-side and the endpoint fetches and streams the bytes. Mirroring the
bytes (Active Storage, or a `bytea` column) buys immunity to rotation and
removes a per-request upstream hop, and costs blob storage, a heavier sync, and
a second thing to keep in step. Take the hop; add mirroring when the upstream
fetch is measurably a problem, which an HTTP cache header on the proxy response
will probably prevent.

Consequence worth stating plainly, because it changes #320: the `avatar_url`
column is **server-only**. `/api/v1/me` and the `Viewer` schema carry the
**proxy path**, never the stored Basecamp URL. The column being named
`avatar_url` and the serialized field being named `avatar_url` does not make
them the same value.

### Staleness: last sync wins, no invalidation

A re-sync overwrites the stored URL for anyone whose avatar changed and leaves
everyone else alone. Between syncs a rotated URL can 404 — the proxy answers
with the same fallback a null avatar gets, so a stale row degrades to the #320
fallback instead of a broken image. There is no cache to invalidate and no
`updated_at` bookkeeping, because the sync is cheap enough to just re-run.

## Consequences

- Basecamp's signed URL never leaves the backend: not in `/api/v1/me`, not in
  a presence frame, not in the client bundle.
- The avatar path is stable, so #320's header and #5's peer characters share
  one URL shape and neither learns anything about Basecamp.
- The refresh token is the single long-lived secret. Rotating it means redoing
  the browser hop above; revoking the app in Basecamp kills the sync and
  nothing else.
- A user with no Basecamp match, no email, or a stale URL renders the #320
  fallback. There is one failure mode, not four.
