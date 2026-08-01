# Composed objects: object art is truth, the composition is an editor-only rebuild note

Modular tileset packs (`5_Floor_Modular_Buildings_32x32` — 1024×8288, 8,288
tiles) ship *parts*, not finished buildings: a ground floor, a middle floor to
repeat, a roof, a door. `/admin/objects` could only crop one rectangle out of an
uploaded PNG, so every building meant composing it in Tiled, exporting a PNG,
uploading it, cropping it, and repeating that for the next building off the same
sheet. We are moving the composing in-app.

**Decision.** An admin composes an object from tiles of one or more
repo-committed **tilesets**; at save the browser flattens the composition onto a
canvas and posts the result as **object art** — the same single PNG data URL
`tile_objects.image` has always held. The **composition** (which tileset, which
tile index, which cell, which layer) is stored beside it in a
`tile_objects.composition` jsonb column and is read **only by the editor**, so
an object can be reopened and remixed rather than rebuilt. The art is truth; the
composition is a rebuild note.

## Considered options

**Render from the tileset at runtime** (store the composition, stamp tiles in
game, no flattened art) was rejected on four counts, one of them hard:

- The client would download the whole sheet — ~8 MB — to draw one shop.
- **8288 px exceeds the max WebGL texture size on common GPUs** (frequently
  8192, sometimes 4096). The sheet may fail to upload as a texture or be
  silently downscaled, which corrupts every tile index. This one is a wall, not
  a trade-off; it would force a slicing/repacking step before the game could use
  a tileset at all.
- `entityLoader.ts` is the single kernel place a reference becomes pixels
  (ADR-0008), and both producers depend on its one-texture-per-object shape.
  `fg_mask` in particular works by clipping a *second, depth-bumped copy of the
  same texture* — with per-tile stamping there is no single copy to clip.
- If the composition were truth, correcting a tileset would silently restyle
  every object ever built from it. With the art as truth, shipped objects are
  frozen.

**Flatten only, no composition stored** was rejected because flattening is
one-way: a variant ("the same bakery with the red brick walls" — precisely what
a modular pack is *for*) would mean rebuilding the object and re-authoring its
walk mask, door and foreground mask by hand, and locating 14 tiles again in an
8,288-tile sheet. It also cannot be backfilled, so every object composed before
the column existed would be permanently un-remixable.

**Uploading tilesets into Postgres** was rejected in favour of the
repo-committed asset contract ADR-0007 already fixes: an 8 MB sheet fetched by
URL is HTTP-cached across page loads, a base64 column is not; a tileset **name**
survives the content-migration truncate-and-reload between environments, a DB id
does not; and `/admin/ground` already picks from that registry, so uploading was
the anomaly. The price is that a new sheet needs a commit, not an in-app upload.

## Consequences

- The game, both map producers, the baked document and ADR-0008 are **untouched**
  — the change is confined to `/admin`.
- A composition can dangle (tileset removed, tiles shifted). That costs
  remixability and nothing else: the art still renders. The editor says so
  rather than silently repainting.
- Objects authored by cropping — every existing one, plus anything from the
  retained upload path (one-off art like a statue PNG) — carry no composition
  and edit exactly as they do today.
- A variant is a **copy**, not a shared reference: editing the bakery can never
  mutate the red bakery. This is why the composition is a column on
  `tile_objects` rather than its own table.
