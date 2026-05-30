# PRD — Decouple the village game from the communities/content layer

> Tracking issue: [#1](https://github.com/zacrify/gather-odt/issues/1)
> ("อยากปรับ structure ของ ตัวเกมให้เป็น blackbox" — adjust the game's
> structure so data can be passed in and out cleanly, and the game can be
> tested as a black box).

## Problem Statement

All of the village-map game logic (tiles, walking, encounters, sprites,
plot placement) is currently intertwined with the CRUD for communities and
their content feed. The same Rails endpoints and serializers carry both the
data ("here are my communities and their unread counts") and the spatial
state ("here is the spawn point on the town map"). Position semantics leak
from the game into the API — `position_order` is interpreted as a plot
index — and the frontend `App` shell, `VillageMap`, and the content-viewing
components all reach into the same shape.

That entanglement means the game can't be tested or reused on its own, and
the CRUD/content layer can't be reused for any non-game UI. Issue #1 asks
for a structure where data can flow cleanly in and out of the game so its
behaviour can be tested as a black box, and the rest of the system is freed
to be used elsewhere (a list view, a dashboard, a bot — any future surface).

## Solution

Carve a clean three-way split:

1. A **Communities + content** module (backend API + frontend data client +
   content UI) that knows nothing about the game world. It exposes plain
   CRUD over communities, their boards, their content items, and per-user
   read/ack state.
2. A **Game Session** module (a tiny backend API + a frontend hook) for the
   game's own spatial/session state — last visited community, derived
   spawn — kept completely separate from the CRUD surface.
3. A **Village Game** React component that is a true black box: it
   receives `communities` and `session` as props, emits
   `onEnterCommunity` and `onSessionChange` events, and has no knowledge of
   how data was fetched or where to navigate next.

The app shell becomes thin: fetch via the communities client + game-session
hook, hand the data to the game, listen for the game's events, open the
community view when one is entered.

The user can reuse the communities API + client/UI in any non-game shell,
and the game can be tested with mock props and a fixture set of
communities — exactly the "blackbox" structure issue #1 calls for.

## User Stories

1. As the developer, I want the game component to accept a `communities`
   array and a `session` object as props, so that I can render the game
   with any data source (real API, fixture, fuzzer) without changing the
   game.
2. As the developer, I want the game to emit `onEnterCommunity(id)` when
   the player walks into a doorway, so that the app shell decides what to
   show next without the game knowing about routing or modals.
3. As the developer, I want the game to emit `onSessionChange` when the
   player's last-visited area changes, so that the shell can persist game
   session state without the game touching the network.
4. As the developer, I want admin actions on the game's `<AdminPanel>` to
   bubble up as `onCreateCommunity` / `onDeleteCommunity` events, so that
   the shell owns the API calls and the game stays pure.
5. As the developer, I want the wild-encounter feature to be triggerable
   purely by walking the avatar onto tall grass with no external data, so
   that the encounter mechanic is a self-contained piece of the black box.
6. As the developer, I want a `GET /api/v1/communities` endpoint that
   lists communities with per-user board/unread/urgent counts, so that any
   UI (game, list, dashboard) can render the headline view.
7. As the developer, I want a `GET /api/v1/communities/:id` endpoint that
   returns a community plus its boards and content items, so that any UI
   can render the community detail without depending on a village payload.
8. As the developer, I want `POST /api/v1/communities` and
   `DELETE /api/v1/communities/:id` to create and delete a community
   (cascading boards + items) with no spatial semantics, so that admin
   operations work the same regardless of UI.
9. As the developer, I want `POST /api/v1/content_items/:id/open` and
   `.../acknowledge` to remain the read/ack endpoints with no game-side
   coupling, so that the read/ack flow is reusable.
10. As the developer, I want a `GET /api/v1/content_items/feed` endpoint
    that returns the Daily Brief shape (must-know + urgent items across
    communities) decoupled from the village payload, so that non-game UIs
    can use the same content feed.
11. As the developer, I want a `GET /api/v1/game/session` endpoint that
    returns the current user's `{ lastArea, lastCommunityId, spawn }`,
    so that the game can hydrate its starting state without pulling
    community data through the same endpoint.
12. As the developer, I want `PUT /api/v1/game/session` to persist the
    game session, so that game-specific state has a single dedicated owner.
13. As the developer, I want the existing `/api/v1/village` aggregate
    endpoint to be removed in favour of the split endpoints, so that there
    is one source of truth per concern.
14. As an admin user, I want adding a community via the admin UI to still
    work end-to-end with the new split endpoints, so that nothing
    user-visible regresses.
15. As an admin user, I want deleting a community to still cascade boards,
    content items, and per-user state, so that the data model stays
    consistent.
16. As a returning player, I want to spawn near the community I last
    visited, so that the game preserves my context across reloads —
    driven by the new game-session endpoint rather than the village
    payload.
17. As a first-time player, I want to spawn at the Town Entrance, so that
    onboarding is unchanged.
18. As a player whose previously-visited community was deleted, I want to
    spawn at the Town Entrance instead of in a dead reference, so that the
    game never appears broken.
19. As the developer, I want the communities API to keep `position_order`
    as a generic integer ordering field, so that the game derives its
    plot layout from ordering without the API owning any plot/tile
    concepts.
20. As the developer, I want the API rename from `/houses` to
    `/communities` to be a clean break (no permanent alias), so that the
    new boundary is unambiguous.
21. As the developer, I want request specs covering the Communities +
    content API (list, show, create, destroy, open, acknowledge, feed),
    so that the reusable surface has guard rails before any other UI
    consumes it.
22. As the developer, I want request specs covering the Game Session API
    (show, update, spawn computation for returning vs first-time users),
    so that the spawn logic is verified in isolation.
23. As the developer, I want the frontend `App` shell to be a thin
    composition of the communities client + the game component + the
    community-detail UI, so that there is a single obvious assembly point.
24. As the developer, I want `<VillageGame>` to live under a single
    directory with no imports reaching outside it, so that it could be
    lifted into a separate package or repo with a copy-paste.
25. As the developer, I want to be able to render the game with a fixture
    set of communities in a standalone harness, so that visual iteration
    on the game does not require a running backend.

## Implementation Decisions

### Module split

- **Backend `Communities API`** (reusable). Endpoints for community
  CRUD, content open/acknowledge, and a flat content `feed`. No spatial
  semantics, no spawn, no reference to a "village".
- **Backend `Game Session API`** (game-only). One endpoint pair for the
  current user's game session — current spawn (derived from the last
  visited community) and persistence of the last visited area.
- **`/api/v1/village` is removed.** Its current caller (the React app)
  moves to the composition `communities + game/session`.
- **Frontend `communitiesClient`**: a tiny module exposing
  `listCommunities`, `getCommunity`, `createCommunity`, `removeCommunity`,
  `openItem`, `acknowledgeItem`, `getFeed`. No JSX, no game references.
- **Frontend `gameSession` client/hook**: `getGameSession`,
  `saveGameSession`. Game-only.
- **`<VillageGame>`** React component (black box) is exported as the
  single game entry. Props:
  - `communities`: `[{ id, title, color, logo_url, category_key,
    position_order, badges: { unread, urgent, requires_ack } }]`
  - `session`: `{ spawn: { area, lastCommunityId } }`
  - `onEnterCommunity(id)`
  - `onSessionChange({ lastArea, lastCommunityId })`
  - `onCreateCommunity(attrs)` / `onDeleteCommunity(id)` — admin
    actions the game raises; the shell calls the API.
- **Content UI** (`CommunityView`, `BoardPanel`, `ContentCard`,
  `DailyBriefShortcut`, `AdminPanel`) is part of the communities side;
  consumes the same shape the client produces.

### API contract changes

- `GET /api/v1/communities` — replaces the `houses[]` portion of
  `/village`. Each entry carries `position_order` (a plain integer) and
  the per-user badge counts that used to live on the village summary.
- `GET /api/v1/communities/:id` — what `/houses/:id` returns today.
- `POST /api/v1/communities` and `DELETE /api/v1/communities/:id` —
  what `/houses` currently does, with the same body shape.
- `GET /api/v1/content_items/feed` — what the village payload's
  `daily_brief` returns today, but as its own endpoint.
- `POST /api/v1/content_items/:id/open` and `.../acknowledge` —
  unchanged.
- `GET /api/v1/game/session` — returns
  `{ lastArea, lastCommunityId, spawn: { area, lastCommunityId } }`.
- `PUT /api/v1/game/session` — accepts `{ lastArea, lastCommunityId,
  lastRoom }`. Replaces `PUT /api/v1/me/location`.

### Schema

- Tables and columns stay as-is for this PRD (`houses`, `boards`,
  `content_items`, `user_content_states`, `user_location_states`). The
  rename happens at the **API boundary and frontend types** only. A
  later PRD may rename tables; that is an explicit non-goal here so
  this refactor stays focused.
- `user_location_states.last_house_id` is still the storage column; the
  API exposes it as `lastCommunityId`.

### Game module boundary rules

- `<VillageGame>` may not import from `communitiesClient` or any
  non-game module.
- `<VillageGame>` may not push to history or open route modals; it only
  emits events.
- All game-specific tile/plot logic (`constants.js`, `encounters.js`,
  the building/sprite/encounter components, the game CSS) lives under
  a single directory and is the only thing that needs to be lifted to
  reuse the game elsewhere.

### Composition in `App.jsx`

- The shell fetches communities + game session in parallel, hands them
  to `<VillageGame>`, and renders the `<CommunityView>` (formerly
  `<HouseInterior>`) when the game raises `onEnterCommunity`. When the
  game emits `onSessionChange`, the shell calls `saveGameSession`. When
  the game raises an admin action, the shell calls the communities
  client and re-fetches.

## Testing Decisions

### What makes a good test

- Tests assert externally observable behaviour: HTTP status + JSON shape
  for the backend, callback firings + DOM-observable state for the
  frontend. They do not poke at private modules or rely on tile maths
  internals.
- Each new endpoint has at least one happy path and at least one
  authorisation / scoping / error case (404 across companies, etc.).
- Spawn logic is tested via inputs (a user with / without a last visited
  community, the community being active vs deleted) and outputs (the
  shape of the returned spawn) — never by inspecting the model directly.
- Tests document the contract a future consumer can rely on; if a test
  needs to be rewritten because internal code changed, the test is
  testing the wrong thing.

### Modules covered

1. **Backend Communities + content state.** Request specs against
   `/api/v1/communities` (list / show / create / destroy), the content
   open/acknowledge endpoints, and the `/content_items/feed` endpoint.
   Round-trip coverage: create → list → show → open → acknowledge →
   state reflected in subsequent reads. Cross-company scoping covered
   (a community id from another company must 404). The current single
   seeded user is the test actor.
2. **Backend Game Session.** Request specs against
   `/api/v1/game/session`. Cases: first-time user (no last community →
   spawn area Town Entrance), returning user with active community
   (spawn references it), returning user whose community was deleted
   (spawn falls back to entrance), invalid `lastArea` ignored, update
   persists.

### Deferred

- The Village Game black-box tests (Playwright-driven with mock props)
  and the frontend client unit tests are deferred to a follow-up PRD —
  the contract from the two backend modules above is the foundation
  those tests will consume.

### Prior art

- The repo currently has Playwright e2e under `.e2e/` (`walk.mjs`,
  `admin.mjs`, `encounter.mjs`, `admin-above.mjs`) — those exercise the
  full stack and remain a useful smoke layer.
- There is no Rails request-spec layer yet; this PRD adds the first
  ones via the standard Rails test scaffolding.

## Out of Scope

- Renaming database tables / columns from `house*` to `community*`.
- Authentication (single seed user persists).
- A separate npm package or Rails engine boundary for the communities
  module — the split is by directory and import discipline, not by
  packaging.
- Frontend tests (component, hook, or Playwright black-box) — deferred
  to a follow-up PRD.
- Any new game features (catch, battle, multiplayer).
- Backward-compatibility aliasing for `/api/v1/village`, `/houses`, or
  `me/location` — this PRD treats the rename as a clean break because
  the prototype has a single live consumer.
- Multi-tenant / multi-company changes beyond what already exists.

## Further Notes

- The black-box mandate from issue #1 ("data in, data out, testable in
  isolation") is satisfied by the `<VillageGame>` props/events contract.
  A later test harness can drive it with fixtures and no Rails running.
- The board-type fixed list (`must_know`, `should_know`, `nice_to_know`)
  and the urgent / requires_ack badge derivation continue to live in
  the backend serializers — they are CRUD-domain concerns, not game
  concerns.
- The encounter feature inside the game module is unchanged: it stays a
  self-contained piece of the game black box.
- Once merged, this should make it trivial to bolt a second UI (a pure
  list, a dashboard, a Slack bot) onto the same backend without
  touching the game module at all.
