# ROADMAP — ODT Village

**Last updated:** 2026-05-24

This is the moving-target plan for getting from today's single-village MVP
to the model laid out in [`CONTEXT.md`](CONTEXT.md): per-user hometowns,
typed houses (community / team / townhall / …), multi-map discovery, and
fractal org geography. Each phase is shippable on its own; later phases
do not start until earlier ones are paying off.

If you are wondering *why* any of this matters, read CONTEXT.md first.
This document is **what** and **when**; CONTEXT.md is **why**.

## Phase 0 — Community module: all communities in one map

**This is where we are today.** It is a real product, not a stepping
stone — Phase 0 ships a working employee app with the spatial-village
UX, just with the simplest possible content model behind it.

What it gives:

- One global village per company, generated from `position_order` on the
  `houses` table.
- Every house is a community (Must Know / Should Know / Nice to Know
  boards). No types.
- `<VillageGame>` is a black box that takes `communities` + `session` as
  props and emits `onEnterCommunity`.
- Communities CRUD lives in its own top-bar tab outside the game.
- Wild encounters fire on a single global encounter table (Vayu Phoenix).
- No memberships. The whole company sees the same village.

Status: ✅ landed.

## Phase 1 — Generalise "community" → "house" at the game boundary

**Ships:** a rename refactor. The game's prop becomes `houses`; the event
becomes `onEnterHouse`. No new types, no schema changes — communities are
still the only house type and the only data shape.

**Unlocks:** the game stops knowing the word "community." Every later
phase can pour data through the same prop without touching the game.

**Cost:** small. Mechanical refactor, one PR.

## Phase 2 — Memberships and the `/me/houses` endpoint

**Ships:** a `community_memberships` (or generic `user_houses`) table on
the backend. A new endpoint `GET /api/v1/me/houses` returns just the
houses the current user belongs to. The frontend's hometown view calls
this instead of the global list. The admin tab still lists *all* houses
in the company.

**Unlocks:** the hometown stops being the same for everyone. A user only
sees what is relevant to them. Joining a community = inserting a row in
the membership table.

**Note:** `position_order` is still global on the house. Per-user ordering
comes in Phase 3.

## Phase 3 — Multiple maps

**Ships:** a `Map` concept on the backend (start with two: `hometown`,
`communities-plaza`). The endpoint becomes `GET /api/v1/maps/:slug/houses`
(or `/me/maps/hometown/houses` for derived per-user maps). The frontend
shell holds a `currentMap` state. The game receives `houses` for whichever
map is current.

**Position per (user, map):** placement moves out of the `houses` table
into a join table — e.g. `house_placements (user_id, map_slug, house_id,
position_order)`. The hometown is derived from memberships; placements
are generated or remembered per user.

**Unlocks:** the discovery map (`communities-plaza`) becomes a real place
that exists separately from the user's hometown. The admin tab can curate
the plaza independently of who belongs to what.

## Phase 4 — Gates and travel between maps

**Ships:** a portal mechanic in the game. The bottom-edge gate at the
south of the map (today decorative) now navigates. Walking through it
raises `onLeaveMap(targetSlug)`; the shell loads the other map. Optionally,
a "fly home" shortcut in the overlay.

**Unlocks:** the user can wander from hometown to plaza on foot. The game
itself remains a black box that just renders "the current map." All map
state lives in the shell.

## Phase 5 — Map-scoped encounter tables

**Ships:** encounter tables move from a global module to a per-map config.
Each map declares its own `{ rate, table }`. The Vayu Phoenix lives only
in `hometown.tall_grass`; the communities plaza gets its own rare spawn
(possibly a once-a-day "unique" that disappears for that user after the
first encounter).

**Unlocks:** the influence-without-coercion mechanic. Going to the plaza
becomes intrinsically rewarding; the user has a reason to wander beyond
their hometown.

## Phase 6 — House types

**Ships:** a `type` column on `houses` plus per-type metadata. New types
in order of demand:

- **Team house** — flexible layout (start with a free-text description; add
  configurable tiles later: Discord channel, Jira board, latest commits).
- **Townhall** — broadcast-only, per department or company.

Each type gets a sibling directory under `src/` (e.g. `src/teams/`,
`src/townhalls/`) with its own detail view, client, and admin. The shell
maps `house.type → detail component`.

**Unlocks:** the village is no longer a content app — it's an
organisational app where many kinds of work-relevant spaces co-exist.

## Phase 7 — Composition into adjacent maps (fractal geography)

**Ships:** maps beyond hometown and plaza:

- **Department floor** — your department's town. Could be its own
  "hometown" at the department level.
- **Org HQ** — company-wide townhall plaza.
- **Project districts** — temporary maps for cross-functional projects;
  they appear, exist for a while, and disappear.

**Unlocks:** the org is fractally rendered in geography. A new hire walks
from their hometown → their team's nearby block → their department floor
→ the org HQ in a natural progression.

## Later — Integrations and a separate team service

**Not blocking on a phase.** When team houses start carrying Discord / Jira
/ Slack / commit feeds, the team module gets large enough to deserve its
own backend service (`team-service`). At that point, the existing Rails
app becomes a thin **houses registry** that aggregates from
`community-service` + `team-service` + others. The orchestrator is *not*
something to build before the per-type services have grown enough to
justify it.

## Cross-cutting — Designer tooling

Not its own phase; lands alongside the phases that need it.

- **Map authoring** (Phase 3+, when curated maps appear): use **Tiled** or
  **LDtk** for designer-painted maps. Replace runtime `buildTown()` with
  a JSON loader that produces the same `town` shape. The game module is
  unchanged.
- **House interior layout editing** (Phase 6, for team houses): use
  **react-grid-layout** (or **dnd-kit** + a custom grid) for the team
  admin's "edit layout" view. Widgets register themselves; the layout +
  per-widget config is saved per house.

Both should be built on top of existing libraries — don't build either
editor from scratch.

## Living-document rules

- When a phase ships, mark it ✅ here and link the merged PR.
- When something changes the design itself (new house type emerges; a
  failure mode we hadn't anticipated), the *intent* update lands in
  [`CONTEXT.md`](CONTEXT.md), and a phase here gets adjusted accordingly.
- Phase boundaries are deliberately broad. Each phase is one or more
  GitHub issues; the issues are where the contract gets nailed down.

## Phase status (current)

| Phase | Status | Issues / PRs |
|---|---|---|
| 0 — Community module: all communities in one map | ✅ landed | #1, #7, #8, #10, #11, #12, #13, #14 |
| 1 — Generalise community → house at game boundary | planned | — |
| 2 — Memberships and `/me/houses` | planned | — |
| 3 — Multiple maps | planned | — |
| 4 — Gates and travel | planned | — |
| 5 — Map-scoped encounters | planned | — |
| 6 — House types (team, townhall) | planned | — |
| 7 — Composition into adjacent maps | planned | — |
