# Task: Dev-gated bleed-layer selection

**Status:** TODO
**Area:** Town ground rendering — `frontend/src/game/phaser/scenes/TownScene.js`
**Type:** Dev tooling (DEV-only, stripped from production)

## Goal

Let a developer toggle, at runtime, **which ground layers bleed**, without editing
code — the same way the `L` panel toggles layer visibility. "Bleed" = a layer
spilling its flat fill one tile into adjacent higher-stacked cells so a higher
layer's transparent edge can reveal it (e.g. road showing under a grass edge).

Right now bleed is a hardcoded constant; experimenting means a code edit + reload.
We want to flip it live and see the ground re-render.

## Current state (what exists today)

- `GROUND_STACK = ['road', 'dirt', 'grass']` — terrain layers, bottom → top.
- `BLEED_LAYERS = new Set(['road'])` — module constant; only road bleeds.
- `paintGround()` reads `BLEED_LAYERS.has(layer)` once, during `create()`. The
  ground is painted a single time at scene boot; there is no re-paint path.
- Dev layer inspector already exists and is the model to follow:
  - Gated behind `const DEV = import.meta.env.DEV` (stripped in prod builds).
  - `setupDevLayers()` builds the `L` panel + number-key toggles + a
    `window.__game.layers` console API (`list/toggle/show/hide`).
  - Ground sprites are bucketed in `this.devLayers` (`roadBase`, `dirtBase`,
    `grass`, …) so they can be shown/hidden.

## Requirements

1. **DEV-only.** No behaviour or bundle weight in production — wrap everything in
   `if (DEV)`, like the layer inspector.
2. **Per-layer bleed toggle** for each entry in `GROUND_STACK`. Default state
   seeded from `BLEED_LAYERS` (road on, others off).
3. **Live re-render.** Toggling a layer's bleed re-runs the ground paint so the
   change is visible immediately — no manual reload.
4. **Discoverable**, consistent with existing dev tooling:
   - Show bleed state in (or alongside) the `L` panel — e.g. a `~` marker per
     layer that bleeds: `1 [x]~ Road base`.
   - Console API: `window.__game.bleed.list() / toggle(name) / on(name) / off(name)`.
   - Pick a key for the toggle action that doesn't collide with existing binds
     (`G`, `L`, `1`–`8`, arrows/WASD, `A`). Suggestion: hold a modifier with the
     number key, or a dedicated key that cycles, or just rely on the console API
     for v1.
5. **Source of truth.** Replace the read of the module-level `BLEED_LAYERS` in
   `paintGround` with a scene field (e.g. `this.bleedLayers`) so the toggle can
   mutate it. `BLEED_LAYERS` stays as the default seed.

## Proposed approach

1. In `create()` (DEV only, before `paintGround`): `this.bleedLayers = new Set(BLEED_LAYERS)`.
   In prod, `paintGround` falls back to the constant.
2. `paintGround` reads `const bleedSet = this.bleedLayers || BLEED_LAYERS` and
   uses `bleedSet.has(layer)`.
3. Add a `repaintGround()` helper that destroys the current ground sprites and
   re-runs the paint:
   - Destroy every sprite in the ground buckets (`roadBase`, `dirtBase`, `grass`)
     and clear those arrays — they are exactly the ground layer sprites.
   - Re-run the per-layer paint loop (extract the loop body of `paintGround` so
     both boot and repaint call it). The sign-overlay pass must be re-run too.
   - Re-apply current visibility state (`this.layerVisible`) after repaint, since
     new sprites default to visible.
4. `setupDevLayers()` (or a sibling `setupBleedToggles()`): wire the key/console
   API to `toggleBleed(name)` → mutate `this.bleedLayers` → `repaintGround()` →
   refresh the `L` panel text.

## Acceptance criteria

- [ ] In dev, toggling road's bleed off makes the road stop spilling (the road
      base ring disappears) on the next frame, with no reload.
- [ ] Toggling dirt's bleed on makes dirt spill into adjacent grass cells; off
      restores the field-only dirt layer.
- [ ] The `L` panel (or console `bleed.list()`) shows current bleed state.
- [ ] Toggling bleed does not disturb the visibility toggles (`1`–`8`) — a hidden
      layer stays hidden after a repaint.
- [ ] Production build contains none of this (verify `import.meta.env.DEV` gating;
      `npx vite build` still succeeds).

## Out of scope

- Persisting bleed selection across reloads.
- Any production/user-facing control — this is a dev affordance only.
- Changing the bleed *semantics* (still "spill into higher-stacked neighbours").
- Per-side or per-neighbour bleed control.

## Notes / open questions

- Key binding: console-API-only is the cheapest v1; a panel key is nicer but must
  avoid the existing binds. Decide during implementation.
- `repaintGround` is the riskiest piece — make sure it tears down exactly the
  ground sprites (the bucket arrays) and nothing else (props/buildings/player).
