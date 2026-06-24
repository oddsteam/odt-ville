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
