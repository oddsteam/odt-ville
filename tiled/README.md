# Tiled authoring workspace

Map-editor files. **Nothing here is served to the app** — the browser only ever
loads two things: the tileset PNGs under `frontend/public/maps/tilesets/`, and the
Tiled **JSON export** you drop in `frontend/public/maps/`.

Kept outside `frontend/` on purpose: Tiled's tileset format uses the `.tsx`
extension, which collides with TypeScript JSX and would confuse tsc/eslint.

```
tiled/
  maps.tiled-project        open THIS in Tiled
  *.tmx                     source maps (editable)
  tilesets/*.tsx            tileset definitions
```

## Adding a tileset

1. Copy the atlas PNG into a category folder under
   `frontend/public/maps/tilesets/` — `buildings/`, `interiors/`, `props/`,
   `terrain/`, `vehicles/`, or a new one. Only atlases you actually place in a
   map belong in the repo; keep
   full asset packs (loose singles, animations, 16x16 variants) outside it.
2. In Tiled: New Tileset → point at that PNG → **32x32, margin 0, spacing 0**.
3. **Set the tileset name to `<category>/<png basename>`** — e.g.
   `buildings/16_Office_32x32`. Tiled pre-fills the name without the folder, so
   type the prefix yourself. The name is the lookup key end to end: the importer
   resolves it as `/maps/tilesets/<name>.png`.
4. Save the `.tsx` in `tiled/tilesets/`.

## Exporting a map

Export as JSON into `frontend/public/maps/`, with **tilesets embedded** — an
export that still references external `.tsx` files is rejected at import.

The importer (`frontend/src/maps/tiledImport.ts`, ADR-0007) enforces four rules
and fails loudly with all violations at once: 32x32 grid, zero margin/spacing,
embedded tilesets, and every tileset name resolving to a real PNG. So a forgotten
copy in step 1 surfaces as a clear error, never as a broken map at play time.

## Naming rule

Never rename a PNG independently of its tileset name — they must stay in lockstep.

Every tileset lives in a category folder; nothing sits flat at the top of
`frontend/public/maps/tilesets/`. Because a tileset's name is persisted in the
`ground_tiles` table and in baked map data, moving one (its name changes with its
folder) means shipping a data migration that rewrites both stores — see
`Tilesets.rename` and `db/migrate/*_rename_grandfathered_tilesets.rb` (#230).
