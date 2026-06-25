# Discussion: Domain Boundaries & Game Team Workflow

> Status: **Parking lot / to revisit.** This is a scratchpad to capture the
> things we noticed are worth a deeper conversation. Nothing here is a
> decision yet — it's the agenda for that conversation.

---

## Why this file exists

While building out the Phaser town we've started accreting concerns that
*feel* like they belong to the game but are really separate domains:

- **Sprite / building art** — discovering art, slicing it into the
  roof+body the engine wants, registering it. (`buildings.js`,
  `scripts/prep-building.mjs`, the character/sprite mapper.)
- **Tiles & maps** — authoring maps (Tiled), tilesets, map manifests,
  procedural tile textures. (`public/maps/*.tmx|json`, `tileTextures.js`.)
- **The game runtime itself** — Phaser scenes, movement, encounters,
  rendering, the session client. (`phaser/scenes/*`, `VillageGame.jsx`,
  `game-session/client.js`.)

Right now these are interleaved inside `frontend/src/game`. The worry is
**tight coupling**: a change to how art is prepped, or how a map is
authored, ends up touching game-runtime code, and vice versa. That makes
the system harder to reason about, harder to test, and harder to split
across people who own different pieces.

This doc is the placeholder for thinking that through properly.

---

## Topic 1 — Domain decoupling

The hunch: there are at least three domains here that should have clean
seams between them, ideally communicating through **data contracts**
(manifests / registries) rather than direct code references.

### Candidate domains

| Domain | Responsibility | Lives near today |
|---|---|---|
| **Sprite / Art Service** | Ingest raw art → normalize → slice → register. Buildings, characters, signs. | `buildings.js`, `scripts/prep-building.mjs`, sprite mapper |
| **Map / Tile Service** | Author & publish maps. Tilesets, Tiled projects, map manifests, collision/object layers. | `public/maps/`, `tileTextures.js` |
| **Game Runtime** | Consume the above as data and *play* the game. Scenes, movement, encounters, multiplayer session. | `phaser/`, `VillageGame.jsx`, `game-session/` |

### The seam we want

The runtime should depend on **published artifacts + a manifest**, not on
the pipeline that produced them. e.g.:

- Art service emits `buildings/<key>-{roof,body}.png` + a manifest entry.
  Runtime reads the manifest. (We're partway there — `buildings.js`
  auto-discovers via Vite glob, which is a soft contract.)
- Map service emits a published map (tiles, layers, objects, spawn points)
  + a manifest. Runtime loads the map by id, knows nothing about Tiled.

### Questions to settle later

1. **How hard is the boundary?** Separate folders/packages? A real
   build-time pipeline that outputs to a `public/` artifact dir the
   runtime treats as read-only? A separate repo/service eventually?
2. **What's the contract format?** A versioned JSON manifest per domain
   (sprite manifest, map manifest) the runtime validates against?
3. **Authoring tools vs runtime.** `scripts/` and Tiled are *authoring*
   tools — should they be excluded from the app bundle entirely and live
   in a `tools/` or `pipeline/` area?
   **Resolved (2026-06-18):** The Tiled project stays self-contained under
   `public/maps` — Tiled needs source `.tmx` + tilesets together with
   working relative paths, and the runtime shares the same tilesets, so a
   split would force duplication or a publish step for little gain (the
   authoring-only files are ~130K vs ~3.5M of genuinely-shipped art). The
   build now strips the authoring-only files (`maps.tiled-project`, `*.tmx`,
   `palette/`) from `dist/` via a small Vite plugin
   (`stripMapAuthoringFiles` in `frontend/vite.config.js`). Revisit the hard
   `pipeline/` boundary only if a dedicated content team needs it.
4. **Naming/keying conventions** as the contract — right now keys are
   derived from filenames (`<name>-roof.png` → `name`). Is filename
   convention robust enough, or do we want explicit manifests?
5. **Testing.** Each domain testable in isolation: art pipeline has
   fixture images, map service validates map schemas, runtime mocks the
   manifests. What does that look like?
6. **Ownership.** If a person/team owns "art" and another owns "maps",
   the seam above is also the org boundary. Does the boundary match how
   we want to split work? (→ Topic 2.)

### Possible shape (sketch, not a proposal)

```
frontend/
  pipeline/              # authoring tools, NOT shipped to runtime
    sprites/             # prep-building.mjs, character/sprite mapper
    maps/                # Tiled project, tileset prep, map publisher
  public/
    manifests/
      sprites.json       # the contract
      maps.json          # the contract
    maps/ ...            # published artifacts (read-only to runtime)
    sprites/ ...
  src/game/              # runtime ONLY — consumes manifests, plays game
```

---

## Topic 2 — Game team workflow (vs. "normal" software dev)

Game dev workflow differs from typical app/web feature work, and that's
worth designing deliberately rather than inheriting our web habits.

### Ways it differs (to discuss)

- **Content vs. code are separate pipelines.** A lot of "work" is
  *assets* (art, maps, tilesets, sound) authored in external tools
  (Tiled, image editors, AI generation), not code in PRs. Both need
  versioning, review, and a path to production — but they review
  differently. You can't really diff a `.png` or a `.tmx` in a PR the way
  you diff code.
- **Roles are more specialized.** Engineers, level/map designers, artists,
  game designers (balance/encounters), possibly audio. Web teams are
  mostly "full-stack engineers + designer".
- **Iteration is visual & feel-based.** "Is this fun? does it look right?"
  isn't covered by unit tests. Needs in-engine preview, playtesting, and
  fast feedback loops (the Tiled map preview + sprite mapper we built is
  exactly this kind of tooling).
- **Determinism & multiplayer.** The session client / multiplayer adds
  state-sync concerns most CRUD apps don't have.

### Questions to settle later

1. **Asset pipeline & review.** How does a new building / map go from
   "artist made it" → reviewed → in the game? Who approves? Where do
   source files (PSDs, Tiled projects) live vs. published artifacts?
   (`maps.tiled-project` being self-contained under `public/maps` is a
   first step.)
2. **Branching/PR strategy for content.** Do content changes go through
   the same PR flow as code? Preview deploys per branch so reviewers can
   *play* the change?
3. **Roles & ownership.** Even if it's a small team now, which "hats"
   exist, and which domain (Topic 1) does each hat own?
4. **Playtest loop.** How do we capture "feel" feedback systematically —
   build previews, recordings, a QA pass dedicated to game feel?
5. **Definition of done for content.** A map isn't "done" because it loads
   — it needs collision correct, spawn points, perf budget (texture
   count, draw calls), visual review.
6. **Tooling investment.** The map preview + sprite/char mapper show we
   already value internal tools. What's the next tool that removes manual
   wiring (e.g., a map publisher, an art manifest generator)?

---

## Pointers (current state, for when we revisit)

- Building art registry & convention: `frontend/src/game/buildings.js`
- Art prep tool: `frontend/scripts/prep-building.mjs`
- Maps & Tiled project: `frontend/public/maps/` (`*.tmx`, `*.json`,
  `maps.tiled-project`, `tilesets/`, `characters/`, `signs/`)
- Procedural tile textures: `frontend/src/game/phaser/tileTextures.js`
- Runtime scenes: `frontend/src/game/phaser/scenes/` (`TownScene`,
  `InteriorScene`, `EncounterScene`)
- Multiplayer/session: `frontend/src/game-session/client.js`
- Existing higher-level docs: `CONTEXT.md`, `ROADMAP.md`,
  `prd-game-blackbox.md`

---

## Evidence: code-graph architecture map (2026-06-14)

We ran the `code-review-graph` architecture mapper over the repo. It
**empirically backs up the domain-separation hunch** above — the three
domains already surface as *distinct communities*, and coupling between
them is already **low** (0 coupling warnings).

Graph snapshot: 363 nodes / 1801 edges across 102 files, 15 communities,
19 flows. Two stacks: a **Rails backend** and a **JS frontend**.

### How the JS frontend clusters (maps onto Topic 1's domains)

| Community | Size | Cohesion | Maps to domain |
|---|---|---|---|
| `scenes-tile` | 62 | 0.17 | **Game runtime** (+ tile rendering fused in) |
| `mappreview-video` | 26 | 0.25 | **Map/Tile** (preview, signs, video) |
| `spritemapper-sheet` | 14 | 0.09 | **Sprite/Art** (mapper) |
| `character-manifest` | 10 | 0.17 | **Sprite/Art** (manifest) |
| `game-session-game` | 3 | 0.15 | **Game runtime** (multiplayer session) |
| `communities-handle` | 22 | 0.20 | Communities UI/handlers |
| `e2e-press` | 25 | 0.03 | E2E tests |

Rails side: `v1-controller` (34), `serializers` (19, cohesion 0.74 —
tight & healthy), `models-user` (10), `migrations` (14), `v1-api` (9).

### Cross-domain coupling (all of it)

Only 5 cross-community edge groups exist, all small:

- `character-manifest → spritemapper-sheet` — 6 edges (art ↔ art)
- `src-me → communities-handle` — 4
- `src-me → game-session-game` — 3
- `character-manifest → mappreview-video` — 3 (art → map)
- `src-me → scenes-tile` — 1

### What this means for the plan

1. **The seams mostly already exist structurally.** The work is making
   them *explicit contracts* (manifests), not untangling a mess.
2. **`scenes-tile` is the one fused spot.** It's the largest community
   (62 nodes) with the lowest cohesion (0.17) — tile/map *rendering* is
   tangled with game *logic* here. This is the natural **first split**:
   carve tile/map rendering out from the runtime.
3. Art domain is two communities (`spritemapper-sheet` +
   `character-manifest`) that talk to each other — they could be unified
   under one "Sprite/Art service" with a single manifest.

> Re-run with `code-review-graph` (`get_architecture_overview`,
> `list_flows`) after refactors to watch the seams hold / coupling stay
> at zero warnings.

---

## Next step

Schedule a focused session on each topic (they're big enough to deserve
their own). Likely order: **Topic 1 (domains/contracts)** first, since the
seams it defines are also the ownership boundaries **Topic 2** depends on.
