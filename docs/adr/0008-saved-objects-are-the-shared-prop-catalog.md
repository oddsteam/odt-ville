# Saved tile objects are the shared prop catalog; maps place references

ADR-0004 named a shared kernel beneath both map producers that includes "the
catalog of available props / house art / monsters" — but never said what that
catalog *is*. In practice two prop models grew side by side:

- The **generated hometown** consumes the saved tile objects from
  `/admin/objects` (`GET /tile_objects/active?kind=` → the single active
  object per kind), loaded as image data URLs and stamped at their authored
  footprint — but through bespoke per-kind plumbing (`_treeObject`,
  `_flowerGroup`, `_buildingObject`).
- The **authored map**'s baked entities reference *spritesheet cells*
  (`{kind:"prop", tileset, frame, x, y}`) — a shape the object mapper never
  produces, so nothing authored in `/admin/objects` can be placed on an
  authored map.

Placing props in the map editor (#108) forced the question: is the editor's
palette a third art source, or do the saved objects become the one catalog
both producers draw from?

## Decision

- **The saved tile objects ARE the prop catalog** (ADR-0004's kernel
  catalog, made concrete). One authoring surface — `/admin/objects` — owns
  prop/house art, footprints, walk/edge masks, and foreground masks.
- **Maps place references, not copies.** The placed-entity shape both
  producers emit is `{kind: "prop", object_id, x, y}`. The editor stores the
  id the author picked; the generated hometown resolves "the active object of
  kind X" *to an id* at generation time and emits the same shape.
- **One shared entity loader/renderer** resolves those references at load:
  collect distinct `object_id`s, fetch the objects (batched), register each
  `image` data URL as a texture, stamp at `(x, y)` sized
  `footprint_w × footprint_h`, above the ground. Kernel-side; imports
  neither producer (ADR-0004 boundary).
- **A dangling reference renders nothing and warns in the editor.** Deleting
  an object referenced by a map is allowed for now; the map skips the missing
  prop at play and the decorate editor marks it so the author can re-place.
- **Legacy `{tileset, frame}` entities remain renderable** (the seed's
  fixture maps). The renderer draws whichever reference style the entity
  carries; new placements are `object_id`-only.

## Considered options

1. **Bake the object's image into the map document** — copy the PNG data URL
   + footprint into `baked.entities` at save. Self-contained, but the
   generated hometown *cannot* bake (it materializes at load from
   memberships), so the two producers would keep divergent prop models —
   exactly the split this decision exists to close. It also forks art:
   editing a tree in `/admin/objects` would update the hometown but leave
   stale copies inside every authored map. Rejected.
2. **A third art source for the editor palette** (hardcoded tileset frames,
   as the first #108 cut did) — cheapest slice, but every prop authored in
   the object mapper stays unplaceable, and the palette needs its own
   authoring story later. Rejected.
3. **Objects as the catalog, maps reference by id** (chosen) — one authoring
   surface, one runtime loader, and per-instance choice on authored maps
   while the hometown keeps its swap-the-active-object retheming (it
   regenerates every load, so it picks up the new active id automatically).

## Consequences

- **ADR-0003 is untouched.** "Bake at author time" is about autotile
  *resolution* — expensive and deterministic. Entity art was always a flat
  reference (`tileset+frame`); `object_id` is the same idea pointed at the
  catalog instead of a sheet. The runtime still never re-tiles; it does
  fetch textures at preload, as it always has.
- **The object document becomes part of the published map contract** — its
  `image`, `footprint_w/h`, `walk_mask`, `edge_mask`, `fg_mask` are now read
  by both producers' render paths. Changing their semantics changes every
  map.
- **Collision unifies for free**: a placed object's authored solid cells can
  contribute to authored-map walkability exactly as they do in the hometown
  — the path to Houses/Zones on authored maps (ADR-0004's later kinds, #90)
  without a new mechanism.
- **The runtime needs a batched object fetch** (e.g.
  `GET /tile_objects?ids=…` with images) so a map with N distinct props
  loads in one request, plus texture keys per object id (`obj.<id>`).
- **TownScene's bespoke prop plumbing is now debt** — a follow-up slice
  folds `_treeObject`/`_flowerGroup`/`_flowerSingle` into the shared loader
  so there is one render path for placed things.
- **Kinds stay open**: the palette lists non-building objects first; placing
  `building` objects (doors, interiors) arrives with the House slice (#90 /
  ADR-0005 world-graph), on this same reference shape.
