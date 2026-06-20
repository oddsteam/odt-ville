# Task: No transparent holes at layer seams (coverage invariant)

**Status:** DONE
**Area:** Ground rendering — `frontend/src/game/phaser/scenes/TownScene.js` (`paintGround`)
**Type:** Rendering invariant (+ verification)

## Invariant

> A **transparent** edge/corner tile must never expose the bare canvas (or the
> wrong terrain). Wherever a higher layer's transparent edge sits, the terrain it
> is meant to reveal must be **painted in that same cell beneath it**. Where two
> different layers' edges/corners meet, the **covering** layer must extend so
> there is no see-through gap — no transparent hole at any layer seam.

## Why

Each ground terrain renders with transparent-on-the-outside edge/corner tiles.
For the transition to read, an opaque tile of the revealed terrain must exist in
the **same cell, lower in the depth stack** — because the neighbour terrain lives
in the adjacent cell, not under the edge. Without that, the transparent fringe
shows `#5fc24a` canvas (or whatever happens to be below), i.e. a hole.

## Current state

- `paintGround` paints each layer in `GROUND_STACK = ['road','dirt','grass']`
  bottom→top; compositing is dumb depth order.
- **Bleed** is the coverage mechanism: a layer in `BLEED_LAYERS` (currently just
  `'road'`) spills its fill one tile into adjacent higher-stacked cells, so a
  higher transparent edge over that cell reveals it.
- Because only road bleeds today, coverage holds **only** where the revealed
  terrain is road. Known gaps:
  - **dirt edges** (dirt is below grass) reveal whatever is under dirt = road or
    canvas, never grass → holes around the field. (Accepted for now; this task is
    where it gets resolved.)
  - **grass edges toward dirt** reveal dirt only because... dirt does not bleed →
    today they reveal canvas unless something else covers.
  - two adjacent different-terrain edge cells can leave a gap on the seam.

## Requirements

1. State the coverage invariant precisely and decide **precedence**: when a cell's
   transparent edge could reveal more than one lower terrain (a grass cell
   touching both road and dirt), which terrain fills the hole? (Top-of-the-lower-
   stack is the natural default.)
2. Guarantee coverage for **every** layer seam, not just road — generalise so the
   necessary bleeds/fills are present under all transparent edges. Options:
   - turn on bleed for whichever layers need to be revealable (extend
     `BLEED_LAYERS` / make bleed direction-aware), or
   - a post-pass that, for each transparent edge cell, paints the correct lower
     terrain's fill beneath it (a targeted "hole filler" rather than a blanket
     bleed ring), or
   - make the upper layer's edge tile opaque-extend to cover (art-dependent).
   Prefer the most surgical option that keeps each layer's own cells clean
   (the user dislikes blanket bleed rings — see the per-layer bleed work).
3. Keep it consistent with the per-layer bleed control (`BLEED_LAYERS`) and the
   "each layer paints its own cells" principle as much as possible.

## Proposed approach

1. Add a **hole-detection scan** (the verification): for each cell, build the list
   of tiles painted there across layers; if the top-most ground tile is an
   edge/corner (transparent) and no opaque fill of the intended revealed terrain
   sits beneath it in that same cell, flag a hole. Run across `plotCount` 1..N.
2. Decide precedence (default: reveal the highest-ranked terrain that is *below*
   the edge's own layer and present as an orthogonal neighbour).
3. Implement targeted coverage: under each transparent edge/corner, ensure the
   intended lower terrain's fill is stamped in that cell at the proper depth —
   ideally a focused fill tied to the edge, not a full surrounding ring.
4. Re-run the scan; zero holes for the whole `plotCount` range.

## Acceptance criteria

- [x] No cell renders a transparent edge/corner over bare canvas at any
      `plotCount` in range (verified by the scan).
- [x] At a grass↔road, grass↔dirt, dirt↔road (stem), and dirt↔grass seam, the
      transparent fringe reveals the intended terrain, not canvas.
- [x] Logical terrain ownership and fixed road → dirt → grass depths are never
      changed by coverage fills.
- [x] Production build unaffected; `npm run build` still succeeds.

## Implemented precedence

The higher-ranked terrain owns each seam. Its transparent edge/corner receives
one targeted lower-terrain fill at that lower terrain's canonical depth. Thus
dirt edges reveal road, while grass edges reveal dirt (or road); dirt remains a
fill at dirt/grass boundaries. If several lower neighbours meet one edge cell,
the highest one in `GROUND_STACK` wins.

The dirt layer derives a one-cell underlay mask beneath adjacent grass, including
diagonal corner cells, and autotiles that mask independently. For the generated
field this produces two complete rectangles separated by the entrance road;
grass still paints above the mask at its unchanged depth.

## Out of scope

- Per-side / per-pixel precision when a single cell borders two different lower
  terrains (a single transparent edge can only cleanly reveal one). Document the
  precedence choice; sub-tile clipping is a separate, later task.
- The map-layout strip invariant (separate task).

## Notes

- This is the "what shows under the transparent parts" piece deferred during the
  dirt-edge / bigger-field work.
- Verification mirrors the map-strip scan: reimplement the paint decision per
  cell and assert the invariant across all map sizes, rather than eyeballing one.
