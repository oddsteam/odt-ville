## Problem Statement

Today ODT Ville has a single map: the per-user **generated hometown**, built by
`buildTown()` from a user's community memberships. Everything the world needs —
layout, autotiling, prop scatter, rendering — is fused onto that one map inside
`town.ts`. There is no way to author a **fixed, hand-designed map** (a shared
hall, a department floor, an event space), no way for employees to see each
other in a shared space, and no first-class way to place **interactive areas**
(a billboard playing a video, a trainer-style challenge) on a map.

The author/admin has no tool to compose a map: they cannot paint a rough terrain
layout and have it autotile, place buildings and props by hand, assign which
monsters spawn where, drop interactive zones, or declare who may enter the map.
The current authoring surface (`TileMapper`, plus an external Tiled project) only
covers building footprints/walk-masks, and the map-building logic is coupled to
the single hometown, so none of it generalises to a second map.

This is the right moment to draw the domain seams (per the
`DISCUSSION-domains-and-workflow.md` Topic-1 work, now resolved) **before** more
objects, monsters, and autotiling accrete onto the town-coupled code.

## Solution

Introduce a **second kind of map that is the same runtime thing** as the
hometown, produced differently, and an in-app editor to author it.

- A **Map** is one runtime shape the black-box game renders (tiles + walk mask +
  placed entities + spawn points + travel portals). Two **producers** emit that
  shape: the existing **generated map** (`buildTown` from memberships) and a new
  **authored map** (a persisted document written by the editor). See ADR-0004.
- Autotiling is **baked in the producer**, never at runtime; the authored map is
  stored as **source + baked artifact**. See ADR-0003.
- Everything on a map is a **Prop** (decorative, may be an animated billboard),
  a **House** (enterable, content behind the door), or a **Zone** (a triggerable
  region). Door-entry, wild encounters, trainer challenges, and travel are one
  primitive — a Zone differing only by **trigger** (`on_enter` / `on_sight` /
  `on_proximity` / `on_interact`) and payload.
- An **in-app map editor** (a code-split `/editor` route) lets an author paint
  terrain (autotiled by the existing layered-priority engine), place
  props/houses, assign monster-spawn zones, drop interactive zones and portals,
  and configure access + multiplayer — previewing **WYSIWYG** with the real
  renderer and **"Preview in game"** for walk-testing. The editor supersedes
  Tiled for new maps.
- **Identity** moves to **Keycloak** (OIDC); each **Map** carries an
  `access_policy` (`public` / `claim` / `members`) enforced server-side.
- **Multiplayer** is a property of the Map: an MVP **presence** channel
  (position broadcasting) so employees see each other in shared maps. Proximity
  voice is a later, separate service.
- Maps **connect via directional edge portals** to named entry points; one map
  is loaded at a time.

The game stays a black box; the editor and runtime meet only at the document and
the shared Tile Catalog / Autotile Engine kernel.

## User Stories

### Authoring — terrain & layout
1. As a map author, I want to create a new authored map with a fixed size, so that I can design a hand-composed space distinct from the generated hometown.
2. As a map author, I want to paint a rough terrain layout (grass, dirt, road, water, floor) with brush/rectangle/flood-fill region tools, so that I sketch a floor-plan without placing individual tiles.
3. As a map author, I want the editor to autotile my painted terrain automatically (correct edges and corners), so that I never hand-place transition tiles.
4. As a map author, I want terrain boundaries resolved by layered priority (the higher terrain owns the seam), so that painting one terrain over another just works.
5. As a map author, I want to introduce new terrains (e.g. water, wall) without code changes, so that authored maps are not limited to the hometown's terrains.
6. As a map author, I want my painted terrain stored as editable source and re-bakeable, so that I can re-open and revise a map later.

### Authoring — entities
7. As a map author, I want to place decorative props (flowers, fences, vehicles) by hand, so that I can dress the map.
8. As a map author, I want to place animated props (a fountain, a flag, a billboard playing a video), so that the map feels alive without those being blocking interactions.
9. As a map author, I want to place enterable houses by hand and attach content/community behind their doors, so that an authored map can mix decorative scenery and content-bearing buildings.
10. As a map author, I want each house to keep its footprint, walk-mask, and door anchor authoring, so that hand-placed houses honour the existing reachability guarantees (ADR-0002).
11. As a map author, I want to assign which monsters spawn in which zone of the map, so that encounters are placed deliberately rather than globally.
12. As a map author, I want to drop interactive zones with a trigger and payload (play media on proximity, challenge on sight, interact-to-act), so that I can make areas interactive.
13. As a map author, I want to place a trainer-style challenge zone whose trigger is a line-of-sight cone, so that walking into its sight starts the encounter.
14. As a map author, I want to place travel portals that send the player to another map's named entry point, so that maps connect on foot.
15. As a map author, I want to define named entry/spawn points on a map, so that portals from other maps can target a specific arrival location.

### Authoring — configuration, preview, save
16. As a map author, I want to set a map's access policy (public, a Keycloak role/group, or membership), so that I control who can enter.
17. As a map author, I want to mark a map as multiplayer, so that the runtime opens a presence channel for it.
18. As a map author, I want a WYSIWYG preview using the real renderer while I author, so that what I see is what players get (correct autotiling, animations, depth).
19. As a map author, I want a "Preview in game" action that launches the real runtime against my draft map, so that I can walk-test interactions, sight cones, doors, and portals.
20. As a map author, I want the editor to reject saving an unplayable map (unreachable door, dangling portal target, unknown terrain/entity), so that a published map is provably playable.
21. As a map author, I want the bake to run on save and persist both source and baked tiles, so that the game loads a ready-to-blit map with no runtime autotiling.

### Playing
22. As a player, I want to load an authored map and have it render identically to how it was authored, so that the experience is faithful.
23. As a player, I want to walk from one map to another through an edge portal, so that travel feels spatial rather than menu-driven.
24. As a player, I want to arrive at the portal's named entry point on the destination map, so that I appear where the author intended.
25. As a player on a multiplayer map, I want to see other employees' avatars moving in near-real-time, so that the space feels populated like Gather.
26. As a player, I want billboards/videos to play ambiently as I walk past, so that they inform me without interrupting my movement.
27. As a player, I want walking into a trainer's sight cone to start the challenge, so that the interaction feels like the Pokémon mechanic.
28. As a player, I want stepping onto an encounter zone to trigger the assigned monster, so that encounters are tied to authored places.
29. As a player approaching a portal to a map I cannot access, I want to see it but be refused with a reason, so that I learn the place exists and why I cannot enter.
30. As a returning player, I want my last map and position respected where applicable, so that travel preserves context.

### Identity & access
31. As an employee, I want to log in with my organisation's Keycloak account, so that I use existing single sign-on.
32. As the system, I want to validate the Keycloak token and resolve it to a local user, so that game membership and per-user state attach to a real identity.
33. As an admin, I want a department/role-gated map to only list and load for users with the matching Keycloak claim, so that access is enforced server-side, not hidden client-side.
34. As an admin, I want a members-only map (e.g. a hometown) to derive access from our membership table, so that game membership stays in our domain, not in Keycloak.

### Developer / architecture
35. As a developer, I want the game to remain a black box that renders "the current map" regardless of producer, so that adding maps never branches the runtime.
36. As a developer, I want the Autotile Engine to be a pure function from terrain + catalog to baked tiles, so that I can test tiling in isolation.
37. As a developer, I want `buildTown` to become one producer that delegates tiling to the shared engine, so that the hometown and authored maps share one resolution path.
38. As a developer, I want the editor and the runtime to meet only at the Map Document and the shared kernel, with neither importing the other, so that the boundary is visible and enforceable.
39. As a developer, I want interactions to flow through one `onZone(trigger, zone)` event channel the shell maps to behaviour, so that doors, encounters, challenges, and travel share one mechanism.
40. As a developer, I want presence frames to carry a stable Keycloak-resolved user id, so that proximity voice can later attach without retrofitting identity.
41. As a developer, I want the catalog (terrains, priority stack, edge sets, prop/house/monster lists) to be data, so that content grows without code changes.

## Implementation Decisions

Grounded in **ADR-0003** (bake tiles at author/generation time) and **ADR-0004**
(a map is a runtime contract with two producers), and the `CONTEXT.md` →
*Multi-map model* glossary. Vocabulary: Map, producer, Prop/House/Zone, trigger,
terrain, `GROUND_STACK`, edge set, Authored Map Document (source + baked).

### Modules — shared kernel (Tile Catalog context)
- **Autotile Engine** (deep, pure): `(terrainGrid, catalog) → bakedTileGrid`. This is today's `groundModel.js` generalised so `GROUND_STACK`, edge sets, and the autotiled-terrain set come from **catalog data** instead of hardcoded constants. The resolution algorithm (layered priority, seam ownership, coverage/backing) is unchanged.
- **Tile Catalog** (data + thin lookup): terrains, priority order, edge sets, and the prop/house/monster catalog.
- **Map Renderer**: the pure tile/prop renderer (`townRenderer`) factored out of the runtime so the editor preview and the game share one draw path. It is a Tile-Catalog consumer, not Game Runtime.

### Modules — contract
- **Map Document**: the source+baked document type plus a save-time **validator**. Source = painted terrain, placements, zones, spawns, portals, access policy, multiplayer flag. Baked = resolved tile grid + placed-entity list the game blits.

### Modules — producers
- **Generated-map producer**: `buildTown` refactored to `(memberships, seed, catalog) → runtimeMapShape`, delegating tiling to the Autotile Engine.
- **Map Baker** (deep, pure): `(sourceDoc, catalog) → bakedDoc`; runs the engine and validation. Invoked by the editor on save.

### Modules — backend (Rails)
- **Keycloak auth**: validate the OIDC JWT against Keycloak JWKS, resolve to a local `User`. Replaces the `X-User-Id` stub.
- **Access Policy evaluator** (deep, pure): `(user, access_policy) → allow/deny`, reading Keycloak claims and membership.
- **Map persistence + API**: a `maps` table and CRUD endpoints.
- **Presence channel**: a per-map ActionCable room, access-gated by the evaluator.

### Modules — game runtime
- **Zone/Trigger detector** (deep, pure): `(avatarPos+facing, zones) → fired trigger events`, including `on_sight` cone geometry.
- **MapScene** (orchestrator, renamed from `TownScene`): receives a runtime map shape + an optional presence stream, wires the World/Presentation/Navigation/Interaction layers, and emits `onZone` / `onLeaveMap` / `requestEntry`. No map-specific knowledge.
- **Map loader / travel**: load-by-slug, portal teardown→load, spawn at `entrySpawnId`.
- **Presence client**: publish my `{ userId, x, y, facing }`, subscribe to others, render their avatars.

### Modules — editor (Map Authoring context)
- **Editor document model** (deep): the in-memory editable source document plus operations (paint terrain, place prop/house, define zone, place portal, set spawn, set policy/flags). Testable apart from the UI.
- **Editor UI**: the React surface at a code-split `/editor` route, built on the deep modules. Import rules: it may import the shared kernel and the Map Document schema; it may **not** import Game Runtime, and the runtime may not import it.

### Schema (to be finalised in implementation)
- A `maps` table keyed by `slug`, carrying: source document (JSON), baked artifact (JSON), `access_policy` (tagged: `public` / `claim{role|group}` / `members`), a `multiplayer` boolean, named spawn points, and metadata (size, title). `invite{userIds}` is intentionally **not** modelled yet.
- Placed entities, zones (with `trigger` + `payload`), monster-spawn assignments, and portals (`{ targetMapSlug, entrySpawnId }`) live inside the document JSON, not as separate relational tables, until a need forces normalisation.

### API contract
- `GET /maps` — returns only maps whose `access_policy` the current user satisfies (no client-side hiding).
- `GET /maps/:slug` — returns the baked map for play; re-checks access (this check doubles as the presence room-join gate).
- `POST /maps`, `PUT /maps/:slug`, `DELETE /maps/:slug` — author CRUD over the source document; `PUT` triggers a re-bake + validation server-side or accepts an editor-baked document validated on receipt.
- Presence: an ActionCable channel scoped per map room, gated by the access evaluator, carrying `{ userId, x, y, facing }`.
- Auth: requests carry a Keycloak JWT; the backend resolves it to a local `User`.

### Interaction model
- The game detects a Zone trigger, pauses if blocking, and emits `onZone(trigger, zone)`; the shell maps `kind → behaviour` (enter house / play media / encounter / portal / challenge), the same pattern as `house.type → detail component`.
- Ambient billboards/videos are animated Props handled entirely in the renderer — they never reach the event channel.
- Map access policy (real, server-enforced authz) is distinct from the ADR-0001 in-game entry gate (a deliberately weak per-door challenge); a `public` map may still contain a posture-gated house.

## Testing Decisions

A good test asserts **externally observable behaviour**, not implementation
details: for pure modules, inputs → outputs; for the backend, HTTP status + JSON
shape and access outcomes; never private internals or tile-maths intermediates.
A test that must be rewritten because internal code changed was testing the
wrong thing.

Isolation tests are mandated for the four deep modules:

1. **Bake pipeline** — the Autotile Engine, Map Baker, and Generated-map producer. Assert terrain → baked-tile correctness, layered-priority seam ownership, coverage/backing under transparent edges, and that the generated and authored paths resolve identically for the same terrain. Pure input/output tests; no Phaser.
2. **Map Document validator** — save-time rejection of unplayable maps: unreachable doors (cf. ADR-0002), dangling portal targets, unknown terrains/entities, missing referenced spawn points. Valid documents pass; each invalid class is rejected with a clear reason.
3. **Access Policy evaluator** — the `public` / `claim` / `members` matrix against users with and without the matching Keycloak claim or membership row; cross-map and cross-company scoping; that `GET /maps` lists only accessible maps and load re-checks.
4. **Zone/Trigger detector** — `on_enter`, `on_sight` cone, `on_proximity`, and `on_interact` geometry → fired events; facing-dependent sight cones; no false fires outside a region.

**Prior art** in the repo:
- Rails **request specs** introduced by the black-box PRD (`/api/v1/communities`, `/api/v1/game/session`) are the model for the Map API and Access Policy tests — happy path plus an authorisation/scoping case each.
- Frontend pure-logic tests already exist for tile/character maths (`frontend/test/buildLadderMask.test.ts`, `townLadder.test.ts`, `characterRigClimb.test.ts`) — the model for Bake pipeline, validator, and Zone detector tests.

## Out of Scope

- **Proximity voice/video chat** — phase 2, a separate SFU/WebRTC service over the same position stream; presence-only is the MVP.
- **Authoritative shared world-state** (server-owned mutable objects, netcode, reconciliation) — only if a concrete feature later forces it.
- **`invite{userIds}` access policy** — deferred until a map needs a hand-picked guest list.
- **Seamless edge-to-edge map adjacency** — one map is loaded at a time; portals only.
- **The Sprite/Art service split** (`buildings.js`, `prep-building.mjs`, the sprite mapper) — still a candidate context, a later pass.
- **Frame-by-frame animation authoring** in the editor — animated props are catalog picks with parameters, not an in-app animation studio.
- **Renaming the `house*` tables** to map/community vocabulary — an explicit non-goal here, as in the black-box PRD.
- Migrating the **legacy Tiled map**; the in-app editor supersedes Tiled for *new* maps only.

## Further Notes

- This PRD realises ROADMAP Phases 3–5 (multiple maps, gates/travel, map-scoped encounters) and the cross-cutting designer tooling, now that their design is decided in `CONTEXT.md` and ADR-0003/0004.
- `TownScene` → `MapScene` is a rename to reflect that the orchestrator is no longer town-specific; kept out of `CONTEXT.md` as an implementation detail.
- The keystone simplification: doors, encounters, trainer challenges, and travel collapse into one Zone primitive on one event channel — the editor's palette and the runtime's contract both stay small as a result.
- Re-run `code-review-graph` after the kernel extraction to confirm the editor↔runtime coupling stays at zero, as the DISCUSSION doc's evidence section established.
