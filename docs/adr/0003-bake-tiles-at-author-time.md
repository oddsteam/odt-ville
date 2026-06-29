# Tiles are baked at author/generation time, not resolved in the running game

Adding hand-authored maps and an in-app map editor (alongside the existing
per-user generated hometown) forced a decision about *where* the autotile
engine runs. That engine already exists — `frontend/src/game/phaser/groundModel.js`
resolves a terrain map into concrete edge/corner tiles by layered priority
(`GROUND_STACK`) — and it could run either in the producer of a map or in the
running game each load. The choice sets both the document format and the
runtime contract, so it is captured here.

## Decision

- **Autotile resolution runs in the *producer*, never in the running game.**
  The producer resolves a semantic terrain map ("this region is water") into a
  concrete tile grid and persists the result; the game blits it. No autotile
  logic ships to the runtime.
- **The editor bakes on save.** Editing is: load source → edit → re-bake →
  save. Validation (door reachability per ADR-0002, etc.) runs at bake/save, so
  a map is provably playable before it ever reaches the game.
- **`buildTown` bakes at generation time.** The generated hometown calls the
  *same* engine when it runs per user; there is no persisted hand-authored
  document for it, but the resolution still happens in the producer, not the
  renderer. `town.ts` therefore loses ownership of autotiling and delegates to
  the shared engine.

## Considered options

1. **Bake at author/generation time** (chosen) — the runtime stays a dumb
   renderer; the document is self-describing and diffable; the heavy autotile
   rules never ship in the game bundle; the map can be validated at save.
2. **Resolve at runtime** — store only the vague terrain zones and run the
   engine on every load. Rejected: it puts autotiling logic back in the
   black-box game, makes the document non-self-describing, and re-resolves work
   that never changes. Its only real win — live re-tiling in response to
   runtime state (seasons, themes) — is not a requirement, and would be an
   additive runtime pass if it ever became one.

## Consequences

- **The Authored Map Document is source + baked artifact** (like source vs.
  compiled binary):
  - *Source layout* — the editable truth (painted terrain zones, placements,
    zone definitions). The editor reads this to re-open a map.
  - *Baked tiles* — the resolved concrete tile grid. The game reads this.
- **Changing the autotile ruleset requires re-publishing maps.** This is
  deliberate — a visible version bump, not silent runtime drift.
- The generator never resolves at runtime, so an invariant like "every baked
  map is internally consistent" can be a pure save-time check.
- See ADR-0004 for the producer/contract framing this sits inside.
