# CONTEXT — One Rev Village

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

- `README.md` (if present) — how to run locally / on the VM.
- `docs/prd-game-blackbox.md` — the architectural split.
- Open issues + PR descriptions for current work in flight.
