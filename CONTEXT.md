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
| **org** | `src/org/` | `Org::` | `companies`, `org_employees`, `org_sites`, `org_employee_sites` *(future: `org_teams`, `departments`)* |
| **auth** | `src/auth/` | `Auth::` | `users` |
| **viewer** | `src/viewer/` | `Viewer::` | `user_content_states` |
| **game-session** | `src/game-session/` | `GameSession::` | `user_location_states` |
| **character** | `src/character/` | `Character::` | `character_manifests` |
| **posture** | `src/posture/` | `Posture::` | — |
| **cards** | *(none — the badge renders inside `game`)* | `Cards::` | — *(in-memory; Eira is the store of record)* |
| **standees** | `src/standees/` | `Standees::` | `standees` |

Frontend-only modules (no server state, no backend counterpart — legal and
expected): `game`, `kernel`, `lib`, the three mappers
(`tileMapper`/`groundMapper`/`spriteMapper`), `analytics`, `dev`, the admin
pages and the shell files. Each side implements the subset it needs.

**org** is the app's downstream read-model of the organization: `Company`
is the tenant root that communities/teams/departments hang off; employee
profiles and the org chart sync in one-way from an external service
(interim: a `talent.odds.team` export; target: an employee-directory service
over a message queue). Identity ≠ profile: `Auth::User` (Keycloak) *links to*
`Org::Employee` via nullable `users.employee_id`, joined on lowercased email —
a person can exist in the org chart before ever logging in. Employees are
*placed at* Sites (many-to-many); users are *assigned* to teams/departments
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

### Standees (resolving — 2026-08-03)

Peer-to-peer announcements left standing on a shared map. Why they sit outside
the baked map document — and why they are not NPCs, not Zones, and not baked —
is [ADR-0015](docs/adr/0015-standees-live-outside-the-baked-document.md).

**Standee**:
A copy of a user's own avatar, deployed by that user onto a multiplayer map at a
cell of their choosing, carrying a **Placard**. It is a *placed entity* like a
Prop or a House, but authored by a player at runtime rather than by an admin at
author time.

Explicitly **not an NPC**: it has no `catalog_npcs` row, no level, never duels,
and never blocks — you walk straight past (or through) it. _Avoid_: modelling a
Standee as `kind:"npc"`, which would inherit blocking, the catalog FK and the
trainer path, all of which are wrong here.

A user's **standee budget is 3, counted across every map** — not 3 per map. The
scarcity is the point: a budget spent world-wide forces the judgement about
whether a message is worth interrupting someone's walk for, and it keeps the
number legible to its owner ("3 standees, 1 is out"). A per-map budget would
grow without bound as maps multiply and leave density entirely to expiry, which
bounds age but not count. At the cap, deploying is **refused with a pointer** to
the standees already out — never a silent replace of the oldest, which would
destroy something the owner still believes is live.

A Standee is **time-bound by construction**: the owner sets an expiry when they
deploy it (defaulted, capped), and it disappears on its own when that passes.
The owner may also pick it up early. This is the opposite of the billboard
back-pressure principle above, and deliberately so: billboard clutter is a
signal fed back to the executives who can correct it, whereas peer clutter has
no gardener — so a Standee decays instead of accumulating. The message genre is
time-bound anyway (a jog, a lunch, an offsite).

A Standee is drawn as a **cutout**, not as a person: the owner's own rig, on a
stand, desaturated a notch, never animated. It must never be mistaken for its
owner standing there — the owner may be on the same map at the same time, and
with three deployed there can be four copies of one person in view. For the
same reason the Standee carries **no name label**; attribution rides inside the
Placard bubble instead, so only the living person wears a nameplate.

Beyond expiry and owner pickup, a Standee is removed by an **admin** (any of
them, any Standee) and by **cascade** — it dies with its owner and with its map,
never orphaned, so a departed employee is not left standing in the plaza
inviting people jogging. There is deliberately **no user-facing report flow**:
one company, real names, faces synced from the Basecamp roster, so the
accountability is social, and an unstaffed report queue would be worse than
none. That is a deferral to revisit at scale, not an oversight.

**Placard**:
The message a Standee carries — the short line shown over its head plus whatever
detail the interaction reveals. Named narrowly on purpose: **announcement** is
reserved for the broader family of push devices (billboards, townhall
broadcasts, wild encounters), of which the Standee is the *peer-to-peer* one.
_Avoid_: "announcement" for a Placard.

A Placard may carry a **reply link** — an owner-supplied URL naming where the
conversation should happen (a Basecamp campfire, a message thread, anything
http(s)). Owner-supplied rather than derived: Basecamp addresses a direct
message by *circle* — a conversation id that only exists once that pair has
already talked — so there is no person-to-DM address to construct. And for the
message genre this serves ("anyone interested?"), a thread beats a DM: three
separate pings about one plan is three conversations instead of one. An absent
or non-http(s) link simply hides the button; the Standee still says its piece.
_Avoid_: modelling the reply link as "chat with this user" — it names a place,
not a person.

The Placard's short line rides over the cutout as a **speech bubble with a
tail** — deliberately a different silhouette from the **card badge** (#317),
which is a chip naming what a *live* person is working on. Both float over a
head and both are clickable, so their shapes must say which is which: a bubble
means someone is *saying* this, a chip means a status is *attached to* someone.
The tail also points at the cutout it belongs to.

A Standee **appears and disappears live**, without a reload. This app is left
open for hours, so a Standee that only materialises on the next map load is
invisible to exactly the people standing in front of it. The event rate makes
this cheap and the shape already exists: the presence channel runs unpartitioned
streams beside its per-cell ones for precisely this class of traffic (card
badges, #317 — "a few frames a day per person against a movement frame every
step"). A deploy is rarer still. Deploying is nonetheless a **durable write**,
not a channel action — it persists and it spends budget — so the broadcast is a
consequence of the write, not the mechanism of it. Expiry needs no server tick:
a client holding the expiry can retire the cutout itself.

Standees live on **multiplayer maps only** — a generated hometown is solo and
per-user, so a Standee there has an audience of one, and it has no document to
live in anyway.

**Deploying** is done by walking: the owner stands on the cell they want, opens
the overlay and leaves the Standee where their own feet are. Location is chosen
the way everything else in this app is chosen — by going there — so there is no
cursor, no coordinate entry, and no admin stamp idiom in a player's hands. The
cell is walkable by definition (they are standing on it) and occupied by nobody
else (likewise). Picking one up is the same press-A the visitor uses to read it:
the owner is offered *pick up* where a visitor is offered the reply link.

A Standee is **inspectable, never an obstacle and never an opponent**: walking
into its cell is allowed, and pressing A on it opens its Placard in full. The
short line rides over its head; the rest is revealed on inspect. Inspection
follows the established seam — the game detects the interact trigger and emits a
semantic event; the **shell** renders the detail and owns any outbound link, so
no vendor integration leaks into the game black box.

### Org roster (resolving — 2026-08-13)

The vocabulary of the `org` module's first real tables — the roster the app
reads so people can be assigned to things *before* they ever log in. Rationale
in [ADR-0016](docs/adr/0016-org-roster-is-a-replaceable-read-model.md).

**Employee**:
A person on the company roster, whether or not they have ever signed in. Keyed
by **lowercased email** — the one identifier every upstream source carries.
Holds `name`, `nickname`, `email`, `join_date`, `left_on`. Identity and profile
stay separate (ADR-0010): a **User** is a Keycloak login, an Employee is a
person; `users.employee_id` links them, nullable on both sides. Someone can be
an Employee with no User (hasn't logged in yet) or a User with no Employee (not
on the roster).
_Avoid_: "user" for a person on the roster, "member" (overloaded with
`maps_map_memberships`).

**Nickname**:
What a person is actually called here — `Un`, `Dews`, `ปิ่น Pin`, `หมวยมี่`.
Not a diminutive of the legal name and not optional decoration: it is the label
the village should prefer over `name`. Legal name is the fallback, not the
default.

**Site**:
A **client engagement an Employee is placed at** — `ttb`, `KTC`, `TISCO`,
`MedPark`. Not a physical office and not a team. A `kind` distinguishes
`client` from `internal` (the placements upstream marks with a trailing
asterisk: `Home*`, `japan*`, `mytrail*`). Placement is genuinely
**many-to-many** — a person split across two clients is normal — so it lives in
its own join table, never as a column on Employee. The site set is
**unordered**: there is no primary site until a feature needs one.
_Avoid_: "location", "office", "project" (a Project is a separate upstream tag
type), "team" (a Team is a delivery team like `FINOVA` or `KTB-OneRev`, which
cuts across sites and lands in its own slice).

**Roster sync**:
The one-way flow that fills Employee and Site. odt-ville is a **read-model and
never a source of truth for org data** (ADR-0010): each sync **replaces** an
Employee's site set from the payload, so an assignment made here would be
overwritten and is therefore not offered. The admin roster page is read-only
for sites. Today's source is a one-off export from `talent.odds.team`; the
durable source is an employee-directory service publishing over a message
queue, not yet built. Nothing keys on the current source's ids — email and site
*name* are the keys, so swapping the source is a new consumer, not a migration.
_Avoid_: "import" for the ongoing flow (it names the temporary scaffolding, not
the concept).

### Character looks (resolving — 2026-08-14)

A user builds their own avatar by mixing part sheets from an asset pack, instead
of picking a whole pre-authored character off the roster. Mirrors object
authoring one-to-one: a **Look** is to a character rig what a **Composition**
is to object art — instructions in, baked art out. Rationale in
[ADR-0017](docs/adr/0017-a-look-is-a-recipe-baked-in-the-browser.md) and
[ADR-0018](docs/adr/0018-parts-ship-as-trimmed-atlases.md).

**Part**:
One PNG from an asset pack covering a single anatomical layer across *every*
frame of the sheet — a body, a set of eyes, an outfit, a hairstyle, an
accessory. Never rendered alone (a body is a naked mannequin, eyes are two
floating dots); only meaningful stacked. Repo-committed and fetched by **name**
over HTTP, on ADR-0007's asset contract, so the browser caches the pack once and
a Look's reference survives a content-migration reload.
_Avoid_: "layer" (triple-booked — map layers, composition layers — and it names
the stacking, not the thing).

**Part slot**:
One rung of the fixed, ordered stack: **body → eyes → outfit → hairstyle →
accessory**. The order is the pack's, not ours (`CHARACTER_GENERATOR.txt`), and
it is a painting order — swapping two rungs produces a broken character, not a
different one. **body** and **eyes** are required (a bodyless Look is nothing; a
face without eyes reads as broken art, not as a style); **outfit**, **hairstyle**
and **accessory** are optional, and a hat renders correctly with no hairstyle
under it. **accessory** takes up to two — the pack's guide says one, but glasses
+ hat verifiably compose, because they occupy different head zones. No conflict
rules: two hats looks silly, not broken, and nobody keeps it. Per-accessory
zones (head/face/worn) are the honest fix if it ever matters — 84 parts to tag.

**Part style / variant**:
The pack's two-level structure: 469 Parts are only **83 styles** — 29
hairstyles, 33 outfits, 19 accessories, 1 body, 1 eyes — each with 3–10
**variants** that differ only in colour (skin tone, hair colour, colourway).
Load-bearing for the picker: nobody scrolls 200 hairstyles, they scroll 29 and
then pick a colour. A Look stores a variant, never a style alone.

**Adult / kid families**:
The pack ships parts for two incompatible body geometries. Adult parts on a kid
body misalign — the eyes land on the chin. Kids are **out of scope**: this is an
employee app, they are 47 of 469 parts, and including them would add a `family`
axis to every Part plus cross-family validation, and drag in the pack's one
composition exception (the two kid pajama outfits need no hairstyle). If they
ever arrive, they arrive as a **second pack** with their own Sheet layout, which
this model already supports.

**Look**:
A user's saved recipe: one Part per Part slot, resolved against a Sheet layout.
The stored truth of a composed character — ~100 bytes, not pixels. A user holds
at most **three**. Its baked output is a rig, exactly as object art is a
Composition's output. Hangs off **User**, not Employee: ADR-0016's roster is a
replaceable read-model that the sync overwrites, and a Look is authored here and
supplied by nothing upstream. Employee holds what upstream says about a person;
a Look is what a person says about themselves.
_Avoid_: "composition" (taken by object authoring, ADR-0014), "outfit" (that is
one Part slot, not the whole character).

**Sheet layout**:
The posture→rect map of an asset **pack**, not of one sheet: which rectangles of
the grid are `walkDown`, which are `idleUp`, and so on. Every Part in a pack
shares one Sheet layout, which is what makes mixing work at all — the same rect
lands on the same body position in all 469 of Modern Interiors' part sheets. It
is also what keeps baking cheap: bake only the mapped rects (~28 frames), never
the whole 1792×1312 sheet, which would cost 9.4 MB of GPU memory per character.
Exists in two forms: the **authored layout** (rects against the original pack
sheet, mapped in `/admin/sprites`, never shipped — committed as
`authored-layout.json` only so the trim is reproducible) and the **packed
layout** (rects against the trimmed atlas, emitted by `scripts/trim-pack.mjs` as
`layout.json` beside the atlases, what the runtime uses). Both live under
`public/maps/characters/packs/<pack>/` and are referenced by **name** — not a
table, on the
same ADR-0007 reasoning as tilesets: a name survives a content-migration
reload, and that script *truncates* first, so a DB id is actively unsafe here.
_Avoid_: "grid" (a manifest's `grid` key is editor-only metadata; the runtime
slices by explicit rects and ignores it).

**Posture** *(sprite sense)*:
One named animation slot of a rig — `idleDown`, `walkLeft`, `climbUp` —
enumerated in `POSTURE_SLOTS`. **Collides with the `posture` domain module**
(`src/posture/`, `Posture::`), which is the *login gate* and has nothing to do
with sprites. Both names stay: renaming the module costs a table and a Ruby
namespace, renaming the sprite sense costs a jsonb key migration across every
saved manifest. If one ever moves it should be the auth one — "posture-login" is
the stranger use of the word.

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
