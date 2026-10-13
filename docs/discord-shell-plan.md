# Discord shell — resolved decisions

Running log from the grill session (2026-10-13). Source of truth for the
build issues. Context: ADR-0022, issue #559 (staged pivot), `docs/handoff-discord-shell-grill.md`.

## 0. Direction

- Staged pivot (#559 constraint 2). Stage 1: Discord shell built in this repo,
  web game frozen but live. Stage 2 (after ~2 weeks of real use): retire
  Keycloak, hometowns, sites, Staff/Client, LiveKit.
- Target server has < 25 members, so the unverified-Activity limit does not
  block stage 1. Discord verification stays out of scope.

## 1. Identity

- New nullable, unique `discord_id` column on `users`.
- First launch auto-provisions a fresh `Auth::User` (default company). No link
  to the user's existing Keycloak user; each person re-picks a character once.
- Email→Employee linking stays deferred (ADR-0022).

## 2. Server → map registry

- New table `discord_guilds`: `guild_id` (string, unique) + `map_id` (FK `maps`).
- No Site link (sites retire at stage 2). Multi-tenant by guild id (#559 c6).
- Rows added by us via `rails runner`; no admin UI in v1.
- Unknown guild → the Activity shows "this server is not set up yet".
- Built in #569: model `Discord::Guild`, `GET /api/v1/discord/guilds/:guild_id/map`
  → `{ slug }` (404 = not set up). Register a server (guild id from Discord:
  Developer Mode → right-click the server → Copy Server ID). The map must be
  `multiplayer` with a `public` access policy — Discord players carry no roles:

  ```bash
  # local: docker compose exec backend ./bin/rails runner '...'
  # homeserver: see the "homeserver migrations" memory (rbenv shims over SSH)
  bin/rails runner 'Discord::Guild.create!(guild_id: "<GUILD_ID>", map: Maps::Map.find_by!(slug: "office-ktb"))'
  ```

## 3. Bot service

- Lives in Rails, no new service in v1.
- `POST /api/v1/discord/session`: exchange the OAuth code, provision the user
  (decision 1), return our own session.
- `POST /api/v1/discord/move`: move a member between voice channels via
  Discord REST with the bot token.
- **Security rule:** `/move` moves only the signed-in user (the session's
  `discord_id`), never an id sent by the client. The spike had no such check.
- Bot token + OAuth client secret live in the homeserver `.env` (user writes
  them; see the prod-secrets memory). Rotate the spike's leaked ones first.
- A gateway listener (voice-state events) is added later only if decision 5
  needs it.

## 4. Shell packaging

- Second Vite entry: `frontend/discord.html` → `src/discord/main.tsx`
  (same pattern as `tile-mapper.html`). No `bootstrapAuth`/Keycloak.
- New `pnpm arch` rule: `src/discord/` must not import `auth/`, `voice/`
  (LiveKit), or admin/editor modules. Shared code only via the game black box,
  `kernel`, `maps`, `catalog`, `communities`.
- Stage 2 can delete the web entry without touching the Discord one.

## 5. Meeting zones, spawn, re-open

- Zone → voice channel by **name inclusion**: zone "Meeting Room" binds to the
  voice channel whose name contains "Meeting Room" (emoji prefixes allowed).
  No binding table in v1. No match → HUD says "this room has no voice channel".
  Move to an id-binding table (#563) only if renames break it in practice.
- Spawn after a hop: last zone from the existing `user_location_state`; the
  re-opened Activity spawns the player inside that room, not at map centre.
- Re-open: before the bot move, the HUD says "Moving you to the meeting room.
  Press the Activity button to come back." No bot-posted link in v1, so no
  gateway listener.

## 6. Feature cut (v1)

- v1 = presence + meeting zones only. One map per server, no portals.
- Out of v1: standees, encounters, boards, card badges, forum-post HUD.
- Forum-post board is v1.1 (prototype #565; needs gateway + MESSAGE_CONTENT).

## 7. Deploy

- Two Discord apps. **Dev**: the spike's app, URL mapping → local tunnel.
  **Prod**: a new app, served by the existing homeserver prod build (hashed
  assets, no cache mixing).
- URL mapping: exactly one, PREFIX `/` → TARGET `odt-ville.p2d.uk` (the bare
  host, no path). Discord appends the request path to the target, so a target
  of `odt-ville.p2d.uk/discord.html` would send `/api/...`, `/api/cable` and
  `/assets/...` to `/discord.html/api/...` and break. Discord launches the
  Activity at `/?instance_id=…&frame_id=…`; `frontend/vite-discord-entry.js`
  (dev server and `vite preview`) serves `discord.html` for `/` when `frame_id`
  is present, and the web app's `/` otherwise. No new hostname, tunnel or
  path rewriting of app URLs. Dev: same, mapping `/` → the dev tunnel host.
- Each app has its own bot token + client secret in that box's `.env`.
- Teammates stay on prod while we change dev.

## Build slices

1. Discord sign-in (entry + arch rule + `discord_id` + `/discord/session`)
2. Guild → map render (`discord_guilds`, unknown-guild screen) — after 1
3. Presence between two users through the URL mapping — after 2
4. Meeting zone → bot move (`/discord/move`, name binding, HUD notice) — after 2
5. Spawn in last room after re-open — after 4
6. Prod Discord app + secrets + token rotation (human) — after 1
