# CONTEXT — ODT Ville

If you are new to this repo (human or AI), read this **before** editing. It
explains *why* the game-style UI exists and what the design language means.
Architecture lives in `docs/prd-game-blackbox.md`; this file is about intent.

## What this is

A single-company employee app where executives have content they need
employees to know and acknowledge. The UI is a Pokémon-Game-Boy-style
top-down village. Each "community" is a building with three boards
(Must Know / Should Know / Nice to Know). Walking the avatar to a doorway
opens that community's content.

This is **not**:

- a Reddit / Medium content feed
- a CMS or wiki
- a corporate intranet portal
- a chat / collaboration tool

## Why a game-style UI instead of a feed

Corporate internal-comms feeds (Workplace, Workvivo, Staffbase, Viva Engage)
all converge on the same pathology: every important item is marked mandatory,
every notification becomes a red badge, and employees learn to *dismiss as
fast as possible*. The "acknowledge" click is the only thing that matters.

Reddit / Medium feeds assume the reader *chose* to be there. Corporate
content is the opposite — the reader is told they have to look. Stapling a
Reddit-style feed onto enforced content is the worst of both shapes.

The spatial village restores the **feeling of freedom**:

- Content is still enforced (the same items, the same ack requirements).
- The user decides *when* to walk over to it, and *which order* to do their
  rounds in.
- Engagement mechanics (wild encounters near important content, billboards
  for truly mandatory items) can guide attention without removing the
  feeling of self-direction.
- Critically: **visual density is a feedback signal**. If executives
  over-mandate, the village fills with billboards and the map looks broken.
  That is intentional — it surfaces over-broadcasting back to the people
  who can correct it, instead of dumping it on employees as another red
  badge.

## Design language

When deciding how to surface content:

| Importance | UI device | What it feels like |
| --- | --- | --- |
| Latest / urgent / time-bound | **Wild encounter** spawns near a community | "you happened to bump into this on your walk" |
| Mandatory / sign-off required | **Billboard** at the community entrance *(planned)* | "you cannot miss this on your way past" |
| Truly broadcast-everyone-everywhere | Many billboards across the map | visibly cluttered — see the back-pressure principle above |
| Daily fallback | The 📋 **Daily Brief** shortcut in the overlay | "I just want the list" — always available |

The village is the **primary** surface; the Daily Brief is the **fallback**
so employees are never blocked from getting their work done if they don't
want to play.

## Architecture intent

`docs/prd-game-blackbox.md` is the full version. The short version:

- The **game module** (`frontend/src/game/`) is a black box. It takes
  `communities` + `session` as props and emits `onEnterCommunity`. No API
  imports, no community-schema authoring inside it.
- The **communities module** (`frontend/src/communities/`) owns the CRUD,
  the content cards, and the admin console. Reusable from any shell.
- The **game-session module** (`frontend/src/game-session/`) carries spawn
  state — the only piece shared between the game and the rest.
- The **admin console** lives in its own top-bar tab outside the game.

These boundaries exist so the game could be reused or replaced without
touching the content layer, and so the content layer could be reused by a
different UI (list, dashboard, bot) tomorrow.

Inside the game, the same discipline applies (the R1–R4 split): the scene
(`TownScene`) is an **orchestrator**, not a feature owner. Procedural map
decoration — the grass, the flower scatter, props — is generated in the pure
**World** layer (`town.ts`, baked into the map data) and drawn in the
**Presentation** layer (`townRenderer`); it is deliberately invisible to the
orchestrator, the Navigation/Interaction layers, and the shell. A purely
cosmetic feature like flowers should touch those two leaf layers and *nothing
else* — `'*'` is already walkable and inert to interactions. The single hook
for future per-map variation (per-hometown flora, admin-tuned density) is a
**seed input threaded into `buildTown`** — until that need is real, decoration
stays a deterministic function of map size, with no orchestration footprint.

### Domain modules (2026-07-16)

The codebase is a **modular monolith with mirrored module names**: a domain
module has the same name as a frontend directory, a backend namespace, and
(for tables created from now on) a table prefix. Rationale and conventions
live in [ADR-0010](docs/adr/0010-mirrored-domain-modules.md); this is the
canonical map.

| Module | Frontend | Backend | Tables |
| --- | --- | --- | --- |
| **catalog** | `src/catalog/` | `Catalog::` | `terrains`, `tile_objects`, `ground_tiles`, `monsters` |
| **maps** | `src/maps/` | `Maps::` | `maps` |
| **communities** | `src/communities/` | `Communities::` | `houses`, `boards`, `content_items` |
| **org** | *(none yet)* | `Org::` | `companies` *(future: `employees`, `teams`, `departments`)* |
| **auth** | `src/auth/` | `Auth::` | `users` |
| **viewer** | `src/viewer/` | `Viewer::` | `user_content_states` |
| **game-session** | `src/game-session/` | `GameSession::` | `user_location_states` |
| **character** | `src/character/` | `Character::` | `character_manifests` |
| **posture** | `src/posture/` | `Posture::` | — |
| **cards** | *(none — the badge renders inside `game`)* | `Cards::` | — *(in-memory; Eira is the store of record)* |

Frontend-only modules (no server state, no backend counterpart — legal and
expected): `game`, `kernel`, `lib`, the three mappers
(`tileMapper`/`groundMapper`/`spriteMapper`), `analytics`, `dev`, the admin
pages and the shell files. Each side implements the subset it needs.

**org** is the app's downstream read-model of the organization: `Company`
is the tenant root that communities/teams/departments hang off; employee
profiles and the org chart will sync in from an external service (plan:
Basecamp API) through a dedicated client. Identity ≠ profile: `Auth::User`
(Keycloak) *links to* a future `Org::Employee` — a person can exist in the
org chart before ever logging in. Users are *assigned* to teams/departments
(org); users *choose to follow* communities (communities). _Avoid_: treating
`Company` as a communities concept, or mastering org data in this app.

Conventions (enforced, not aspirational):

- **Frontend public API is a file-pattern, not a barrel** — cross-module
  imports may target only `schema.ts` (types), `service.ts` (reads),
  `write.ts` (mutations), or a module-root component. No `index.ts`
  barrels: they'd blind the path-based catalog write firewall. Checked by
  `pnpm arch`; today's deep imports are baselined and burn down when
  touched.
- **DB seams stay soft** — no hard FKs across the game↔org/communities
  seam; cross-cluster references are nullable or deliberately FK-less
  (`users → character_manifests` nullify, `user_location_states.last_house_id`).
  New tables carry their module prefix; existing tables are never renamed.
- **Structure ratchets** — new code conforms; old code migrates only when
  a feature touches it. Never a refactor sprint.

## Language

Spatial primitives the town generator (`town.ts`) works in:

**Plot**:
A building's reserved cell on the town grid — its `col`/`row` origin plus `w`/`h`
in tiles. Today every plot is a fixed 3×4; #30 sizes it from the active
building's footprint.

**Footprint**:
A building art's *authored* tile size (`footprint_w`/`footprint_h` on the
building tile-object). #30 makes the plot adopt the footprint instead of
stretching the art into 3×4. Clamped to **3..6 wide × 4..6 tall** (`clampFootprint`
in `town.ts`): 3×4 is the minimum the nameplate + roof/body split needs, 6×6 the
documented cap that keeps the town from running away; out-of-range art stretches
into the clamped box.
_Avoid_: "size", "dimensions" (ambiguous between tiles and pixels).

**Uniform grid**:
The town layout when every plot shares one footprint — regular arithmetic, no
fitting logic. The #30 model.

**Packer**:
A layout pass that fits *different*-sized plots together with row wrapping —
only needed once footprints vary per plot (deferred to #31). Not used while the
grid is uniform.

**Door anchor**:
The single cell (`door_dx`/`door_dy` offset from a plot's top-left) the avatar
enters through — read by `isWalkable` / `playerDepthAt` / interactions. #30
clamps it to the footprint bounds, not the old 3×4.

**Walk mask**:
A per-building, tile-aligned grid of which footprint tiles the avatar may stand
on (porch / path leading to the door); everything else in the footprint stays
solid. Authored in the admin tool and validated so the door is reachable before
save (#32). Until #32 lands, a footprint is solid except its door, and an
unreachable authored door snaps to bottom-centre at runtime (#30).

### Object authoring (2026-08-01)

The vocabulary of `/admin/objects` — how source art becomes a placeable object.

**Tileset**:
A source art-pack sheet: one PNG holding a uniform grid of many tiles
(`5_Floor_Modular_Buildings_32x32.png` — 1024×8288, 8,288 tiles at 32px). The
raw material, never rendered by the game as a whole. Shared: one tileset feeds
many objects.

Repo-committed, not uploaded (ADR-0007's asset contract): the PNG lives under
`frontend/public/maps/tilesets/<category>/`, registered with its `cell` size in
`catalog/groundTiles/tilesets.js`, and is fetched by **name** over HTTP — so an
8 MB sheet caches across page loads and a composition's reference stays portable
across environments (a name survives the content-migration reload; a DB id
doesn't). `/admin/ground` already works this way; `/admin/objects` uploading its
own copy is the anomaly.
_Avoid_: "atlas" (it loses to `frontend/public/maps/tilesets/`, the `.tsx` files,
ADR-0007 and Tiled's own vocabulary), "spritesheet" (reserved for character
rigs).

**Object art**:
The finished, flattened PNG of *one* object — what the game actually draws
(`tile_objects.image`, registered as texture `obj.<id>`). Not a file: a base64
data URL in a Postgres `text` column. Produced in the browser
(`canvas.toDataURL()`) and posted up; never rendered server-side.
_Avoid_: "image" alone (a tile object carries two PNGs — its art and its
`fg_mask` foreground stencil).

**Composition**:
The instructions that produced a piece of object art: which tilesets, which tile
index, at which footprint cell, on which layer. Points *at* tilesets; object art
is its **output**, not something it references. Ordered layers exist because a
prop tile (a hanging sign) can sit over a wall tile in the same cell, though the
common case is one tile per cell.

Editor-only — the game never reads a composition (see ADR on composed objects).
The art is truth; the composition is a rebuild note that makes an object
*remixable* (swap the wall tiles for the red variant) instead of rebuild-only. A
dangling composition (tileset deleted, tiles shifted) costs remixability and
nothing else: the art still renders.

**Tile object**:
Unchanged, and distinct from its art — the *record*: object art plus footprint,
door anchor, walk mask, edge mask, foreground mask. Objects authored before
compositions existed simply have none; a composition cannot be recovered from
flattened art.

## Multi-map model (resolving — 2026-06-29)

The roadmap's Phase 3+ multi-map work is being designed. This section is
**language + a decision index** — the *rationale* for the load-bearing choices
lives in the ADRs, and the *spec* (schema, endpoints) will live in the
multi-map PRD, so this stays the glossary and does not duplicate either.

### Language

**Map (runtime shape)** — what the game black box renders: tiles + walk mask +
placed entities + spawn points + travel portals. Two **producers** emit the
same shape: a **generated map** (`buildTown` from memberships + seed — today's
per-user hometown) and an **authored map** (a persisted document from the
in-app editor — fixed, shared). _Avoid_ calling the authored map a different
*kind* of thing: same shape, human placement instead of generation. (ADR-0004.)

**Placed Entity** — anything a producer drops on a map. Three kinds:
- **Prop** — decorative art, no trigger. May be **animated**: an ambient
  billboard/video is an animated prop — a *rendering* concern, **not** an
  interaction.
- **House** — an enterable building (footprint, walk-mask, door, content
  behind it). *Owns* an entry Zone; is not itself one. Authored maps may mix
  props and houses.
- **Zone** — a triggerable region (`trigger` + `payload`); the game detects
  the trigger and emits a semantic event, the **shell decides behaviour**
  (same pattern as `onEnterCommunity` / `house.type → detail component`).

**Collision mask** (2026-07-03) — a per-cell "blocked" grid on a
map, painted directly in the in-app editor. It is **not** a Placed Entity: it
has no art and no trigger — it only vetoes walkability. It exists because a
Tiled-imported map's blockers (building bases, water) are baked into terrain
*art*, so there is nothing to "place"; painting the mask is how that art
gains collision. Placed entities still contribute their own walk-mask
collision on top. _Avoid_: modelling blocked cells as invisible Props.

**Trigger** — the axis that unifies every interaction: `on_enter` (door,
encounter patch, portal), `on_sight` (trainer duel cone), `on_proximity`,
`on_interact`. Door-entry, encounter, trainer challenge, and travel are one
primitive differing only by trigger + payload — not four mechanics. (ADR-0004.)

**Bounded contexts** — the **Tile Catalog / Autotile Engine** (a pure,
map-agnostic *shared kernel*: tile types, autotile rules, the
prop/house/monster catalog) sits beneath both producers and the renderer;
**Map Authoring** (the editor) and **Game Runtime** (the black box) each depend
on the kernel and meet only at the document — neither imports the other.
(ADR-0004.)

**Authored Map Document = source + baked** — *source layout* (editable: painted
terrain, placements, zones; read by the editor) plus *baked tiles* (the
resolved grid; read by the game). Editing = load source → edit → re-bake →
save; bake validates playability (cf. ADR-0002). (ADR-0003.)

**Terrain / `GROUND_STACK` / edge set** — the autotile vocabulary already in
`groundModel.js`: a **terrain** is a paintable ground type; **`GROUND_STACK`**
is the priority order (higher rank **owns the seam**); each terrain has one
**edge set** (4 edges + 4 corners) with a **coverage** fill under transparent
edges.

**Pattern** (resolving — 2026-07-01) — a **visual variant of one terrain**:
plain grass vs. tall grass vs. flowery grass are all still *grass*. A pattern
is purely an art/rendering concern — it shares the terrain's identity,
walkability, and its single **priority** rank, so two patterns of the same
terrain abut with **no seam** between them. It does **not** re-slice the stack
(that would be terrain (B), rejected). Today's single edge set per terrain is
the *default* pattern; "more than one pattern per type" adds sibling patterns
under the same terrain. _Avoid_: calling a pattern a terrain, or giving it its
own priority. (Open: whether each pattern carries its own edge set, how a
pattern is selected at bake, and the exact-match pattern-to-pattern transition
tile — being resolved.)

**Hometown Policy** (2026-07-07) — the generated producer's authored inputs:
which catalog object is *active* per kind (tree, flower-group, flower-single,
building), the wild-encounter pool, and (future) seed / density / flora
theming. Read by `buildTown` at generation time. **One global admin-configured
policy for every user** — the "active"/"enabled" toggles in the admin pages
are its current form. The producer reads it through a single resolution point,
so per-user/per-cohort policies (department flora, onboarding pools) stay a
*possible later* second adapter behind the same seam — not built, not promised.
Distinct from the **Tile Catalog** (the set of things that *exist*) and from
the Authored Map Document (fixed maps carry explicit placements and Zone
payloads instead of a policy — they never read one). Consequently there is no
"hometown map editor": the hometown has no layout to edit, only policy; the
admin surface for it is a *generation settings* page, separate from catalog
CRUD. _Avoid_: modelling the active toggles as catalog data, or "activating"
anything for authored maps.

### Decisions (2026-06-29)

Index, not rationale — the load-bearing ones have ADRs; the rest are settled
and get specced in the multi-map PRD.

- **Tiles bake in the producer, never at runtime** — ADR-0003.
- **One map shape, two producers; entities are Prop/House/Zone** — ADR-0004.
  `town.ts` shrinks to the generated producer; `GROUND_STACK` /
  `AUTOTILED_TERRAINS` move from hardcoded constants to Tile Catalog **data**.
- **Identity = Keycloak (OIDC)** authN + coarse role/group claims; fine-grained
  game membership stays in our DB. `Map.access_policy` ∈ `public` ·
  `claim{role|group}` · `members` (`invite{userIds}` deferred), enforced
  server-side at list + load/join. Distinct from the ADR-0001 in-game entry gate.
- **Multiplayer is a `Map` property** — MVP = presence only (per-map
  ActionCable broadcasting `{userId,x,y,facing}`, stable Keycloak id); proximity
  voice is a later *separate* SFU/WebRTC service over the same position stream.
  Generated hometowns stay solo; authoritative shared world-state is out.
- **Editor = same SPA `/editor` route**, code-split; the document is the seam;
  editor and Game Runtime never import each other. Preview = shared WYSIWYG
  renderer (factor `townRenderer` into the kernel) + a "Preview in game" launch
  against the draft document.
- **Maps connect via directional edge portals** (`on_enter` Zone →
  `{targetMapSlug, entrySpawnId}`), one map loaded at a time, no seamless
  adjacency. Gated targets are **visible-but-refused-with-a-reason**.
- **Layout-to-autotiling = semantic terrain painting** with region tools;
  boundaries resolve by the existing layered-priority engine, so adding a
  terrain is O(N) art. ~~The in-app editor supersedes Tiled for authored
  maps~~ — **amended 2026-07-03**: Tiled is re-admitted as a *terrain*
  producer (defining an edge/corner set per terrain proved expensive; Tiled
  lets an author freely mix art across asset packs). A Tiled import converts
  tile layers into the existing `BakedGround` shape (gid → tileset+frame,
  layer order → depth) — the human in Tiled *is* the autotile resolution, so
  ADR-0003 ("bake in the producer") still holds and the runtime gains no
  second render path. The in-app editor remains the tool for objects
  (collision) and zones. The imported Tiled JSON is stored *inside* `source`
  (self-contained document: anyone can pull the terrain down to edit in
  Tiled; baked stays re-derivable). Re-import, matched by slug, replaces the
  terrain half only — in-app objects/zones always survive; a resize keeps
  them, flagging any now out-of-bounds instead of dropping. No reverse
  export of objects/zones into the Tiled file. **Collision never comes from
  Tiled** — the importer ignores Tiled object layers (incl. `collisions`);
  an imported map starts fully walkable and collision is authored in-app
  only, by painting a per-cell **collision mask** or by placing objects
  (whose `walk_mask`/footprints block as usual). **A map's terrain producer
  is exclusive** — `painted` or `tiled`, never mixed: Tiled-sourced maps
  lock the in-app paint tools, and every terrain edit is edit-in-Tiled +
  re-import, keeping re-import a wholesale terrain replace. (A painted
  overlay atop a tiled base is a possible later additive, not part of this.)
  Asset contract: tileset PNGs are repo-committed under
  `frontend/public/maps/tilesets/` named exactly as in Tiled (the existing
  runtime convention); export as JSON with **embedded tilesets**; the
  importer runs client-side in the editor and validates at import time
  (uniform 32px tiles, no margin/spacing, every PNG resolvable) — imported
  tilesets need **no Tile Catalog entry** because the baked document
  self-carries `{name, cell}`. (ADR-0007 — 0005/0006 are claimed by the
  world-graph and Basecamp ADRs on `docs/adr-0005-world-graph`.)
- **Saved tile objects are the shared prop catalog; maps place references**
  — added 2026-07-05. The objects authored in `/admin/objects` are
  ADR-0004's kernel catalog made concrete: the one authoring surface for
  prop/house art, footprints, walk/edge/foreground masks. Both producers
  emit the same placed-entity shape `{kind:"prop", object_id, x, y}` — the
  editor stores the id the author picked; the generated hometown resolves
  "active object of kind X" to an id at generation time (so swapping the
  active tree still rethemes hometowns, while authored maps keep their
  chosen object). One shared kernel loader resolves references at load
  (batched fetch → `obj.<id>` textures → stamp at footprint). Maps do NOT
  copy the image into `baked` — the hometown can't bake, and copies fork
  art. A dangling `object_id` renders nothing and warns in the editor;
  legacy `{tileset, frame}` entities stay renderable. ADR-0003 unaffected
  (entity art was always a flat reference). (ADR-0008)

## Where the model is heading

The current code calls everything "community," but the conceptual model is
evolving in two related directions. Both are design choices, not yet built;
the execution path lives in [`ROADMAP.md`](ROADMAP.md).

### House is a spatial primitive, not a synonym for community

A **house** is what the game renders — a building at a plot, with a
coloured roof, a door, and an emoji nameplate. What's *behind* the door is
not the game's business.

Today every house is a community. Tomorrow houses will have **types**:

- **Community house** — the current Must Know / Should Know / Nice to Know
  boards.
- **Team house** — your team's working space. Likely a flexible layout
  configured by the team admin (Discord channel embed, Jira tiles, recent
  commits, etc.).
- **Townhall** — your department or the whole company. Broadcast-only.
- **(open ended)** — onboarding flows, training, project districts.

The game stays a true black box: it renders a building with a door. The
shell looks at `house.type` and decides which detail component to mount
when the door opens.

#### Entry gates

Orthogonal to type, a house may carry an **entry gate** — a requirement the
player must satisfy *before* the door opens. Entry is therefore a gateable
interaction, not a binary cut: the game stops the avatar in the doorway,
pauses, and emits `requestEntry`; the shell runs the gate and tells the game
to enter or release. The first gate is **posture-login** — a standalone
verification service where the credential is a hand shape, run on the
service's own hosted page and confirmed server-to-server by our backend. The
game never knows what the gate *is*; it only learns the avatar is approved.
See [`docs/adr/0001-gated-door-entry.md`](docs/adr/0001-gated-door-entry.md).
This is the same gatekeeper shape as the gate trainer, but scoped per door.

### Relevance is a coordinate, not an algorithm

The original mental model was a single global village containing every
community in the company. We're moving toward something better: **each
user has a hometown**.

- The **hometown** is generated *for that user* from what is relevant to
  them — communities they follow, the team they're on, their department's
  townhall, onboarding houses while they're new.
- Other places (the **communities plaza**, the **org HQ**, future
  **department floors**, **project districts**) are separate maps the user
  visits when they want to discover or check in.
- Influence — not coercion — pulls the user out: unique wild encounters
  spawn in the communities plaza so there's a *reason* to wander, the way
  rare Pokémon on Route 24 made the player leave Pallet Town.

What this gives the design:

- **Relevance is unambiguous.** The user sees what they see because they
  walked to where it lives — no "for you" algorithm to argue with.
- **Joining a community gets a physical metaphor.** A house *appears* in
  your hometown when you join. Your hometown's skyline is the visual
  identity of *your* time at the company.
- **Discovery is geography, not a tab.** The "browse all communities"
  menu — the one nobody opens — becomes a place to *visit* with a goal.
- **The org becomes fractally legible.** Hometown → team → department →
  company. Each level can have its own map, and travel between them is
  natural in a way no menu hierarchy can be.

This is also a categorical shift in product proposition: from "the same
corporate content with a nicer interface" to "the org is a place you live
in, with a place that is *yours*."

## Inspirations (and why this combination is rare)

- **Spatial work apps**: Gather, Sococo, Teamflow — solve presence, not
  enforcement.
- **Gamified corporate learning**: Axonify, EdApp, Centrical, EthenaHQ —
  make compulsory training engaging, but use feeds, not worlds.
- **Location-based games**: Pokémon GO, Ingress — the textbook "spawn what
  you want them to look at, near where you want them to look." Niantic
  monetises this; we use it for internal comms.
- **Incumbent feeds**: Workplace, Workvivo, Staffbase, Viva Engage — the
  pathology this design exists to avoid.
- **Theory**: Yu-kai Chou's *Actionable Gamification* (Octalysis), Nir
  Eyal's *Hooked*, Jane McGonigal's *Reality is Broken*, Bartle's player
  taxonomy.

The exact combination — spatial UI for compulsory corporate content with
visual density as a governance feedback signal — does not appear to be a
category leader in any public market as of this writing.

## Failure modes to watch for

- **"Make everything mandatory"** pressure from leadership → the map turns
  into a wall of billboards. The design *intends* this to be visible; resist
  hiding it.
- **Acknowledgment-grinding** ("walk to every door, click ack, log out") →
  if telemetry shows this, the game mechanics are too thin. Add variable
  reward (richer encounters, narrative tied to content).
- **Game getting in the way of urgent communication** → the Daily Brief
  shortcut must stay. It is the safety valve.
- **Drift from the principle** — if a proposed feature would equally fit a
  Reddit-style app, ask whether we are sliding back into that paradigm.

## What to read next

- [`ROADMAP.md`](ROADMAP.md) — the phased path from today's village to
  the hometown / multi-map / typed-house model.
- `README.md` (if present) — how to run locally / on the VM.
- `docs/prd-game-blackbox.md` — the architectural split.
- Open issues + PR descriptions for current work in flight.
