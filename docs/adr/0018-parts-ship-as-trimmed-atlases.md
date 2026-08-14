# Parts ship as trimmed atlases against a committed pack layout

ADR-0017 makes a Look a recipe of **Parts**, baked in the browser. That only
works if the browser can fetch Parts. The Modern Interiors Character Generator's
32×32 set is **469 files, 24 MB** — over 3× the entire current
`frontend/public/maps/` (7.2 MB) and equal to the whole `.git`. Each file is a
full 1792×1312 sheet of roughly 2,300 frames, of which a rig uses about **28**.

Two constraints sharpen this. `oddsteam/odt-ville` is a **public** repository,
and the pack's `LICENSE.txt` reads *"YOU CAN'T: Resell or distribute the asset
to others"* — committing 469 source sheets publishes the pack itself. And a
decoded 1792×1312 texture costs ~9.4 MB of GPU memory, so ten peers on a map
would be 94 MB if the runtime ever held whole sheets.

## Decision

- **Parts ship as trimmed atlases, not source sheets.** An ingestion script
  crops each part sheet to only the rects the pack's layout names and repacks
  them compactly: ~4 KB per Part instead of ~50 KB, ~2 MB for the pack instead
  of 24 MB.
- **A Sheet layout therefore exists in two forms.** The **authored layout** maps
  postures against the original 1792×1312 sheet — what an admin produces in
  `/admin/sprites`, never shipped. The **packed layout** maps the same postures
  against the trimmed atlas — emitted by the trim script beside the atlases, and
  the only one the runtime reads. Every atlas in a pack shares one packed
  layout, which is what keeps Parts mixable after trimming.
- **The layout is a committed file per pack**, at
  `public/maps/characters/packs/<pack>/layout.json`, referenced by pack
  **name**. No `sprite_layouts` table.
- **`/admin/sprites` is unchanged.** It already maps postures on a sheet and
  offers a JSON download, and `downloadManifest.js` already instructs the
  author to commit the result. Pack ingestion is therefore: map postures in the
  existing UI → download JSON → run the trim script → commit atlases + packed
  layout. UI for the human judgement, CLI for the pixels.

## Considered options

**Committing the raw part sheets** was rejected on all three axes at once: 24 MB
into the repo, ~50 KB per Part over the wire, and — decisively — it publishes
the pack verbatim on a public GitHub repository, against a licence that
forbids distribution. Modern Interiors tilesets are already committed under
`frontend/public/maps/tilesets/`, so this exposure predates the feature; going
from a handful of tilesets to the complete Character Generator makes it much
harder to argue it is not redistribution. A trimmed atlas is a derived subset
baked into a product, which is the ordinary use the licence grants.

**Padding the trim with transparency** — keep the original coordinates, let PNG
compress the empty space — is tempting because it needs no packed layout and no
second rect map. It was rejected because it optimises the wrong number: the file
shrinks, but the *decoded* texture is still 1792×1312 and still costs 9.4 MB of
GPU memory per character. Disk was never the binding constraint; memory is.

**Curating a subset of Parts** (~70 raw sheets, ~3.5 MB) was rejected as the
worst of both: it still publishes source art verbatim, still ships ~50 KB per
Part, and throws away the pack's actual selling point. 200 hairstyles is what a
character generator is *for*, and at 4 KB each the full set is cheaper than the
curated raw one. Curation is a picker problem — the pack is only 83 styles with
3–10 colour variants each — not a storage problem.

**Serving Parts from Postgres** keeps them out of the public repo, but breaks
ADR-0007's asset contract and buys a real hazard: `scripts/migrate-content`
**truncates** tables before reloading, so a Look referencing a Part by DB id
would not survive a content migration between environments. A pack-scoped
**name** does. This is the same reasoning that put tilesets in the repo, quoted
in `CONTEXT.md` under Tileset.

**A `sprite_layouts` table** was rejected for the same portability reason plus
proportion: a controller, a serializer, a migration and admin CRUD, to hold one
row per pack that changes only when a developer commits 24 MB of source art
anyway.

## Consequences

- **An admin cannot add a pack without a developer and a commit.** This is
  correct rather than limiting: adding a pack means adding source art to the
  repo and running a trim. The eventual "user uploads their own spritesheet"
  path is the existing DB/dataURL manifest route, not this one.
- **Atlases are only valid for the authored layout they were trimmed against.**
  Re-mapping a pack's postures means re-running the trim. Acceptable because a
  pack's geometry is a fixed fact, authored once at ingestion and then frozen —
  but it does mean the authored layout must be committed too, or the trim
  cannot be reproduced.
- **The trim script is the first thing that must exist.** Nothing else in the
  feature — bake, builder, preview — can be tested without atlases and a packed
  layout to test against.
- **The pack layout already exists in draft.** `public/maps/characters/scout.json`
  contains a correct authored layout for this pack's geometry; its rects were
  verified to land correctly on the part sheets. Stripping its `sheet` key
  yields the Modern Interiors authored layout.
- **Source art stays outside the repo.** The 24 MB pack lives wherever it lives
  today (`map-assets/`); only derived atlases are committed, so the trim script
  needs the source path as an input and cannot run in CI.
