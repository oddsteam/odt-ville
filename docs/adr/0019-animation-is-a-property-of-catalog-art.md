# Animation is a property of catalog art, not a kind of placed entity

Wanting an animated spell book on a map, and an animated door that swings as
you walk through it, reads like two features. It surfaced three questions that
had to be answered together:

- **Format.** The art pack (`map-assets/moderninteriors-win/3_Animated_objects/`)
  ships each animated object twice — as a `.gif` and as a horizontal frame
  strip PNG under `spritesheets/`. The spell book is 2304×64 (72 frames of 1×2
  tiles); `animated_door_1_32x32.png` is 160×64 (5 frames of 1×2).
- **Where frames live.** ADR-0008 made saved tile objects *the* prop catalog,
  and `tile_objects.image` is one flattened still. The only animation the
  runtime has (`frames`/`fps` on `BakedEntity`, #85) is bolted to the *legacy*
  `{tileset, frame}` reference style, 1×1 tiles, no masks — which the same ADR
  calls legacy.
- **Whether a door is a Prop.** A door that gates passage would be the first
  placed entity to change walkability at runtime; nothing in the map runtime
  can do that (`walk_mask` is baked per object, the collision mask is static).

## Decision

- **An animated object is a Tile object with `frame_count > 1`.** Two columns
  on `tile_objects` — `frame_count` (integer, default 1, not null) and `fps` —
  and `image` holds the frame strip verbatim. `frame_count: 1` is today's still
  object, byte-identical. No second table, no second authoring page, no second
  reference style on a map: ADR-0008's one catalog stays one catalog.
- **Frame size is derived, never authored**: `frameWidth = imageWidth /
  frame_count`, `frameHeight = imageHeight`. This deliberately avoids
  `footprint_w`/`footprint_h`, which are floats (overhang authoring) and would
  yield fractional frame widths.
- **GIF is not a supported format.** Import the pack's `spritesheets/` PNG. No
  decoder ships — not in Phaser, not in the mask editors, not in the palette.
- **`playback` is the one field that separates a billboard from a door** —
  `loop` (time drives the playhead) or `proximity` (the avatar's distance
  does: forward when near, reverse when far, hold at both ends). It lives on
  the **catalog object**, not the placement, exactly as the walk mask does: a
  door behaves like a door on every map that places it.
- **A swinging door is decorative.** Its cell is walkable at every frame. The
  open/close animation is theatre played around a passage that was always
  open — so there is no runtime collision state, no multiplayer sync, and no
  server-side door state.
- **Interaction stays a Zone.** A pressable spell book is a Prop plus an
  `interact` Zone (`payload: {kind: "link", url}`, #110) on its cell — already
  decoded and dispatched. No `on_interact` field on a tile object, and no new
  `ZonePayload` member.

## Considered options

1. **A separate animated-object catalog** (new table, new admin page) — clean
   separation, but it forks ADR-0008: maps would carry two reference styles,
   the decorate palette two sources, and footprint / walk mask / edge mask /
   foreground mask / door anchor authoring would all need duplicating for the
   animated half. Rejected.
2. **Frames as a jsonb array of data URLs** — no strip slicing, but the spell
   book becomes 72 base64 PNGs in one Postgres row and 72 texture registrations
   at preload, against one today. Rejected.
3. **Reuse the #85 `frames`/`fps` path on legacy `{tileset, frame}` art** —
   already works and costs nothing, but it is 1×1 tiles only (every animated
   object in the pack is at least 1×2), carries no masks or door anchor, and
   ADR-0008 named that reference style legacy. It would grow the shape this
   codebase is trying to retire. Rejected.
4. **A stateful Door kind that actually blocks** — the pack ships a `_locked`
   variant of every door, so the art anticipates it. Rejected *for now*: it
   needs a dynamic layer over the baked walk rule, an "what unlocks it" payload,
   and — on `multiplayer` maps — a server authority and a presence message for
   door state. That is a mechanic, not an art format, and it should be designed
   once someone wants a specific lock. Deferred deliberately.
5. **Animation on the placement instead of the object** — would let one map's
   door swing on approach and another's flap forever. Rejected: it makes the
   same art mean different things per map, the failure ADR-0008 exists to stop.

## Consequences

- **The object document contract grows two fields.** ADR-0008 already warned
  that `image` / `footprint_w/h` / masks are read by both producers; `image`
  now additionally means "a strip when `frame_count > 1`". Any consumer that
  treats `image` as one still must learn the strip, or crop to frame 0.
- **`entityLoader.ts` branches once.** `loadObjectTextures` picks
  `load.spritesheet` over `load.image` on `frame_count > 1`; `stampEntity`
  picks `scene.add.sprite` + an anim over `scene.add.image`. Both of its call
  sites — `mapRenderer.ts` (authored maps) and `townRenderer.ts` (the generated
  hometown) — get animation from that one change, so the two producers do not
  drift.
- **Both map-entry paths are covered for free.** Objects reach the scene via
  the single `bakedObjects` registry key, set identically by `MapPage`,
  `MapPreview` and `PhaserGame.enterPortal` — so this does **not** repeat the
  per-target key drift that AGENTS.md documents (bakedNpcs, #294/#295). Still
  verify through a town portal, not only `/maps/:slug`.
- **`frame_count`/`fps`/`playback` belong on `TileObjectSummary`**, not just
  the full serializer: the summary is what the decorate palette lists, and the
  full object spreads the summary's fields, so one addition serves both.
- **Non-Phaser previews must crop.** `MapDecoratePage.tsx:457` renders
  `<img src={o.image}>`, which would smear a 2304px strip. The fix is CSS — a
  frame-sized box with `background-size: calc(frame_count * 100%) auto` — and
  a `steps(frame_count)` keyframe animates the palette thumbnail for free. No
  `thumbnail` column, so no stale-copy drift.
- **Authoring is an import, not a composition.** `TileMapper.tsx` already
  uploads an arbitrary PNG as a sheet; an animated object is that PNG stored
  verbatim with `frame_count` computed from the footprint. It therefore has no
  composition (ADR-0014), which costs remixability and nothing else — the same
  trade every pre-composition object already made. Masks are painted against
  frame 0.
- **Locked doors are unblocked, not blocked, by this.** When one is wanted, it
  arrives as a new placed kind with state on top of this art format — the
  format does not have to change to allow it.
