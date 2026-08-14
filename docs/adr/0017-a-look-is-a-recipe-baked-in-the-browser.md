# A Look is a recipe, baked in the browser, not a flattened sheet

The Modern Interiors Character Generator ships *parts*, not characters: 469 PNGs
across five layers (body, eyes, outfit, hairstyle, accessory), every one of them
a full 1792×1312 spritesheet where a given rectangle holds the same body
position in every file. Stacking body + eyes + outfit + hairstyle + accessory at
matching rects produces a coherent character; a part alone is a naked mannequin
or two floating dots. That is thousands of characters from 469 files — but the
runtime only knows how to draw **one** sheet. `characterRig.js` loads a single
image as texture `char.sheet`, slices explicit rects into it, and builds one
looping anim per posture; peers, NPCs and Standees all reuse that shape.

The decision is what a user's composed character *is* — in the database, and at
the moment the game needs pixels.

## Decision

- **A Look is a `CharacterManifest` with a recipe instead of a sheet.** The
  blob gains `data.parts` (one Part per Part slot, referenced by pack-scoped
  **name**) and `data.layout` (the pack's packed Sheet layout); `data.sheet`
  becomes the *other* art source, not the only one. Nothing downstream learns a
  union type: `users.character_manifest_id` and
  `catalog_npcs.character_manifest_id` are untouched, and ADR-0009's resolution
  chain stays exactly three tiers — **my pick → global active → committed
  default**.
- **The recipe is truth; the pixels are derived.** ~100 bytes per Look, no
  images in Postgres. A user holds at most **three** Looks.
- **The bake happens in the browser, inside the game.** `characterRig.js`
  queues the Part atlases in `preload()`, composites them onto a canvas under
  the existing `sheetKey`, and `buildCharacterRig` then runs *completely
  unchanged* — a canvas texture slices into frames exactly like an image one.
  The pure `parts[] → HTMLCanvasElement` composite lives in `kernel/`, with no
  Phaser import, on the same seam `kernel/mapRenderer.ts` already uses.
- **Only the mapped frames are baked.** The Sheet layout names ~28 rects; the
  bake covers those, never the full sheet.
- **Manifests gain `owner_id` and visibility.** A Look is personal; the roster
  index defaults to house-owned rows.

## Considered options

**Bake in the shell and put the result on the registry** was rejected on the
gotcha this repo has already been bitten by. It needs a new per-target registry
key, and `AGENTS.md` documents what happens next: `MapPage.tsx` and
`PhaserGame.enterPortal` populate the registry independently with no shared
source of truth, so a new key gets wired into one path and not the other. That
is precisely how the placed-NPC rigs (#294/#295) shipped rendering on
`/maps/:slug` and blank through a town portal. Baking inside the game keeps the
recipe riding the `characterManifest` key **both** paths already set: zero new
keys, both entry paths correct by construction.

**Stacking five Phaser sprites at runtime** — no bake at all — was rejected
because it multiplies that same two-path problem by five and breaks every
consumer that assumes one sprite per character. Standees desaturate via
`art.setTint(EFFIGY_TINT)` on a single object; `peerAvatar.ts` bakes a circular
avatar from a single texture; `applyFacing` flips one sprite. Layers can also
desync mid-anim. Phaser 4 has already removed `BitmapMask`/`setMask` here, so
the usual per-layer escape hatches are gone.

**Storing a flattened PNG** (bake once, keep the base64) was rejected on three
counts. The recipe is the interesting object — "change my hair" needs it, and so
does any question about what people picked. It bloats `character_manifests.data`
by ~80 KB per user in jsonb. And it inverts the caching: a recipe lets the
browser fetch the *pack* once and reuse it across every character on screen,
whereas a flattened sheet is a bespoke download per peer.

**Compositing server-side** into content-addressed PNGs was rejected as the most
machinery for the least gain: a new Ruby image dependency (vips/mini_magick), a
new storage surface, and no ActiveStorage in the app today — to produce
something the browser can build in a few milliseconds from art it already has
cached.

**A separate `Composition` entity beside manifests** was rejected because it
forces `users` to point at one of two things, which means two resolution paths,
two loaders and two picker surfaces. A recipe and a sheet answer the same
question — *how do I get frames for this character* — and after the bake they
are literally the same texture.

**Baking the whole sheet** was rejected on memory. 1792×1312 decodes to ~9.4 MB
of GPU memory per character; ten peers on a map would be 94 MB. Baking the ~28
mapped rects is ~230 KB, a 40× saving, and it is the Sheet layout that makes it
possible — which is why that layout is a runtime input, not editor metadata.

## Consequences

- **`buildCharacterRig`, `applyFacing`, peers, NPCs and Standees are
  untouched.** They receive a texture and rects, and never learn where the
  pixels came from.
- **Peer texture keying is unchanged.** A Look is a manifest with an id, so
  `peer.sheet.<manifestId>` still works and two employees wearing the same Look
  share one texture.
- **Rendering a character is now asynchronous in a new way** — N atlas fetches
  plus a composite, rather than one image load. The peer path's three-state
  resolution (`null` in flight → hidden, `false` → bundled stills, object →
  rig) already models this; the player path must tolerate the same delay.
- **A Look can dangle** if a Part name disappears from a pack. Like ADR-0014's
  composition, the honest behaviour is to say so, not to silently repaint —
  but unlike ADR-0014 there is no flattened art to fall back on, so a dangling
  Part must degrade to *that slot missing*, not to a broken character.
- **The roster index needs an owner filter before this ships.** It currently
  feeds both the user picker and the admin NPC rig `<select>`; a few hundred
  personal Looks would make both unusable.
- **Composed NPCs come free.** `catalog_npcs` already points at a manifest, so
  an admin can generate villagers with the same tool.
- **The pick stays on `Auth::User`, not `Org::Employee`.** ADR-0016's rule that
  "assignments hang off Employee, never off User" governs *placement* — site,
  team, community — because those are facts the org owns. A Look is the
  opposite: authored only here, supplied by no upstream, and the roster sync
  **replaces** an Employee's data on every run, so a Look on that row is the one
  field the importer would have to learn to preserve. ADR-0016 already made this
  call for a person's picture, skipping `profile_image_url` on the grounds that
  `Basecamp::AvatarSync` owns `users.avatar_url` and "stays the single writer".
  Employee holds what upstream says about a person; a Look is what a person says
  about themselves. Durability across an IdP swap is not a reason to move it —
  `find_or_provision_user` already re-links by email onto the same user row.
  The cost is that an avatar cannot be pre-assigned to someone who has never
  logged in; if the roster page ever wants faces, that is a join through
  `users.employee_id`, not a column move.
