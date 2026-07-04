# Tiled is re-admitted as a terrain producer (import to the baked shape)

The 2026-06-29 multi-map decisions said the in-app editor supersedes Tiled
for authored maps: terrain would be painted semantically and resolved by the
layered-priority autotile engine. Living with that revealed its real cost —
every terrain needs an authored edge set (4 edges + 4 corners + inner
corners + coverage) in the Tile Catalog before it can be painted at all,
while in Tiled an author freely stamps tiles from any purchased asset pack
with no per-terrain setup. Meanwhile the parts the in-app editor is actually
*better* at — placing objects with collision, defining zones — are clumsy in
Tiled. This ADR amends the earlier decision rather than quietly
contradicting it.

## Decision

- **Tiled becomes a terrain producer.** An author builds the ground in the
  Tiled map editor, exports JSON (embedded tilesets), and imports it in the
  in-app editor. The importer converts Tiled tile layers into the existing
  `BakedGround` shape (`gid − firstgid` → frame, layer order → depth). A
  Tiled cell is already a concrete human-made (tileset, frame) choice, so
  the human in Tiled *is* the autotile resolution — ADR-0003 ("resolution
  runs in the producer") holds, and the runtime gains no second render path
  (ADR-0004's one-shape rule holds too).
- **The in-app editor keeps everything else.** Objects (with their
  walk-mask collision), zones, and a paintable per-cell **collision mask**
  are authored in-app only. The importer ignores Tiled object layers,
  including `collisions`; an imported map starts fully walkable.
- **The imported Tiled JSON is stored inside `source`.** The document stays
  self-contained: anyone can pull the terrain down to edit in Tiled, and
  the baked ground stays re-derivable. Re-import, matched by slug, replaces
  the terrain half wholesale and always preserves in-app placements/zones/
  mask; a resize keeps entities, flagging any now out-of-bounds. No reverse
  export of objects/zones into the Tiled file.
- **A map's terrain producer is exclusive** — `painted` or `tiled`, never
  mixed. Tiled-sourced maps lock the in-app paint tools; terrain edits are
  edit-in-Tiled + re-import.
- **Asset contract by repo convention.** Tileset PNGs are committed under
  `frontend/public/maps/tilesets/`, named exactly as the tileset is named
  in Tiled (the convention `mapRenderer` already loads by). The client-side
  importer validates at import time — uniform tiles matching the map's
  32 px grid, zero margin/spacing, every referenced PNG resolvable — so a
  bad export fails loudly at import, never at play. Imported tilesets need
  no Tile Catalog entry: the baked document self-carries `{name, cell}`.

## Considered options

1. **Import to `BakedGround`** (chosen) — one runtime shape, no new render
   path, ADR-0003/0004 intact; Tiled is "just another producer."
2. **Render Tiled JSON natively at runtime** — promote the existing
   `mapPreview/TiledMapScene.js` prototype into the game. Fastest to ship
   but bakes a permanent second render path into the black box — exactly
   what ADR-0004 rejected. The prototype stays a dev tool.
3. **Reverse-map Tiled art onto semantic terrains** so the paint editor
   could edit imports. Lossy-to-impossible for freely mixed art; defeats
   the reason for using Tiled.
4. **Keep the semantic-painting-only decision** — rejected by experience:
   per-terrain edge-set authoring is the bottleneck, and it taxes exactly
   the activity (terrain art) Tiled already does well.

## Consequences

- **Semantic terrain painting is not deprecated** — generated hometowns and
  painted authored maps keep using the autotile engine; this adds a second
  way to produce the terrain half, it does not replace the first.
- Imported terrain is *opaque art*: the app cannot know a cell is "water."
  Anything semantic — collision, triggers — must be authored in-app on top
  (the collision mask exists precisely for this).
- Changing terrain requires the Tiled round-trip; that friction is accepted
  and bounded (a painted overlay atop a tiled base is a possible later
  additive if it bites).
- New asset packs enter via repo commit (deploy-reviewed, licensing kept
  in-repo), not user upload.
- See CONTEXT.md "Multi-map model" for the amended decision index entry and
  the **Collision mask** glossary term.
