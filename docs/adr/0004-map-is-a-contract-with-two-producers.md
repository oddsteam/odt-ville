# A map is a runtime contract with two producers (generated and authored)

Today `town.ts` fuses three concerns onto the single per-user hometown: it
*generates* the layout from community memberships, *resolves* ground tiles
(autotiling), and feeds *rendering*. Adding a second map that is fixed-size,
hand-authored, shared across users, multiplayer-capable, and carrying
interaction zones forced the keystone question: is the authored map a
*different kind of thing* from the hometown, or the *same thing* produced a
different way?

## Decision

- **There is one runtime map shape** — tiles + walk mask + placed entities +
  spawn points + travel portals — and the Phaser game is a black box that
  renders it without knowing who produced it.
- **Two producers emit that same shape:**
  - **Generated map** — `buildTown` fed by the user's memberships (+ seed).
    The per-user hometown. Procedural, derived, solo.
  - **Authored map** — a persisted document written by the in-app editor.
    Fixed, shared. The new map.
- **A shared kernel sits beneath both producers** — the **Tile Catalog /
  Autotile Engine**: tile types, the layered-priority autotile rules, and the
  catalog of available props / house art / monsters. Map-agnostic; depends on
  nobody. Both producers depend on it; so does the renderer.
- **Everything placed on a map is one of three kinds** — *Prop* (decorative,
  no trigger; may be animated, e.g. an ambient billboard), *House* (enterable;
  footprint, walk-mask, content behind the door), *Zone* (a triggerable region
  carrying a `trigger` + `payload`). Door-entry, wild encounter, trainer
  challenge, and map travel collapse into one primitive — a Zone differing only
  by trigger and payload.
- **`town.ts` becomes one producer**, not "the map." It keeps generation
  (memberships → plots → placed houses + procedural scatter) and delegates tile
  resolution to the shared engine (ADR-0003).

## Considered options

1. **Two aggregates / two render paths** — model "hometown" and "authored map"
   as distinct domain objects the game renders differently. Rejected: it
   reintroduces exactly the coupling this work exists to remove — the game
   would grow a branch per map kind.
2. **One polymorphic runtime shape, pluggable producers** (chosen) — preserves
   the black-box game and the roadmap's already-stated "same shape, different
   loader" plan, and makes the editor "just another producer."

## Consequences

- **The runtime map shape (and the editor's document) becomes the published
  contract** — the explicit seam the `DISCUSSION-domains-and-workflow.md`
  Topic 1 was hunting for. The editor and the game meet only here and at the
  shared kernel; neither imports the other.
- **`GROUND_STACK` / `AUTOTILED_TERRAINS`, today hardcoded constants in
  `groundModel.js`, move to Tile Catalog *data*** so authored maps can
  introduce terrains (floor, water, wall) without code changes. The resolution
  algorithm is unchanged; only its inputs move from constants to catalog.
- **Encounters, interactions, and travel stop being bespoke mechanics** and
  become Zone payloads — one event channel (`onZone(trigger, zone)`) the shell
  maps to behaviour, the same way it maps `house.type → detail component`.
- Multiplayer and access become properties of the *map* (a `multiplayer` flag,
  an `access_policy`), not of the game — keeping the black box unchanged.
- The generated hometown stays solo and per-user; shared authored maps are
  where presence and access policy actually bite.
