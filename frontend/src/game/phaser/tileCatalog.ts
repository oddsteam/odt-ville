// Tile Catalog — the *data* the autotile engine resolves terrain against
// (ADR-0003/0004). The layered-priority rules used to be hardcoded in
// groundModel.js (`GROUND_STACK`, `AUTOTILED_TERRAINS`); they now live here as
// data so a producer — the generated hometown OR an authored map — can
// introduce a terrain (water, floor, wall, …) without touching engine code.
//
// A catalog has two parts:
//   * the resolution rules the engine reads — `stack` (low→high priority) and
//     the `autotiled` set (which terrains draw transparent edge tiles at the
//     seams a higher terrain owns); and
//   * the art the *baker* needs to turn a resolved cell into a concrete
//     (tileset, frame) tile — `tilesets` (with a declared column count so a
//     frame index is computable offline) and `tiles` (the atlas coordinates per
//     terrain/role/side).
//
// The engine functions only ever touch `stack` / `autotiled`; the baker also
// reads `tilesets` / `tiles`. Map-agnostic and dependency-free by design.

export interface TerrainDef {
  type: string
  // Whether this terrain draws transparent edge/corner tiles where a
  // higher-priority terrain owns the seam. (grass + dirt today; road is the
  // opaque base.)
  autotiled?: boolean
}

// A tileset the catalog's art references. `cell` is px per tile; `cols` is the
// column count of the source sheet, so `frame = row * cols + col` is derivable
// at bake time without loading the image (the runtime never re-derives it).
export interface CatalogTileset {
  name: string
  cell: number
  cols: number
}

// One piece of terrain art: an atlas coordinate plus the surface role it fills.
// `role` is 'fill' | 'edge' | 'corner'; `side` is null for fill and a direction
// (N/E/S/W or NE/NW/SE/SW) for edges/corners. Mirrors the GroundTile record.
export interface CatalogArtTile {
  tile_type: string
  tileset: string
  col: number
  row: number
  role: string
  side: string | null
}

export interface TileCatalog {
  // Terrains low→high priority; later entries draw on top and own the seam.
  stack: string[]
  autotiled: Set<string>
  tilesets: CatalogTileset[]
  tiles: CatalogArtTile[]
}

export interface CatalogOptions {
  tilesets?: CatalogTileset[]
  tiles?: CatalogArtTile[]
}

// Build a catalog from an ordered terrain list (bottom → top) plus optional art.
// The order *is* the priority stack, so the only thing a new terrain needs is a
// position in this list and (for baking) its art.
export function makeCatalog(terrains: TerrainDef[], opts: CatalogOptions = {}): TileCatalog {
  return {
    stack: terrains.map((t) => t.type),
    autotiled: new Set(terrains.filter((t) => t.autotiled).map((t) => t.type)),
    tilesets: opts.tilesets ?? [],
    tiles: opts.tiles ?? [],
  }
}

// The generated hometown's catalog — the data equivalent of the old hardcoded
// constants. road (opaque base) < dirt < grass (top); grass + dirt autotile.
//
// It now carries art (#81): the bundled terrain sheet's road/dirt/grass fills
// plus grass's edge/corner transitions, so the hometown producer (townMap.ts)
// bakes its ground through the SAME shared engine the authored map uses
// (ADR-0003/0004) — autotiling resolved once, in the producer, never at runtime.
// grass owns every seam in the town (it ranks highest and the field is grass-
// margined), so dirt/road need only a flat fill. Atlas coordinates mirror the
// meadow fixture's illustrative cells on the bundled 1_Terrains_and_Fences_32x32
// sheet (32 columns); the live townRenderer still reads the registry catalog and
// is untouched.
const HOMETOWN_SHEET = '1_Terrains_and_Fences_32x32'
export const HOMETOWN_CATALOG: TileCatalog = makeCatalog(
  [{ type: 'road' }, { type: 'dirt', autotiled: true }, { type: 'grass', autotiled: true }],
  {
    tilesets: [{ name: HOMETOWN_SHEET, cell: 32, cols: 32 }],
    tiles: [
      { tile_type: 'road', tileset: HOMETOWN_SHEET, col: 0, row: 0, role: 'fill', side: null },
      { tile_type: 'dirt', tileset: HOMETOWN_SHEET, col: 1, row: 0, role: 'fill', side: null },
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 2, row: 0, role: 'fill', side: null },
      // grass transitions onto lower terrain — the four sides + four corners.
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 1, row: 1, role: 'edge', side: 'N' },
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 2, row: 1, role: 'edge', side: 'S' },
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 0, row: 2, role: 'edge', side: 'W' },
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 2, row: 2, role: 'edge', side: 'E' },
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 0, row: 1, role: 'corner', side: 'NW' },
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 3, row: 1, role: 'corner', side: 'NE' },
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 3, row: 2, role: 'corner', side: 'SE' },
      { tile_type: 'grass', tileset: HOMETOWN_SHEET, col: 0, row: 3, role: 'corner', side: 'SW' },
    ],
  },
)

// Edge-set lookup the engine consumes: `{ terrain: { side: true } }` for every
// terrain that has edge/corner art, derived purely from catalog data. A terrain
// only autotiles a border for which art actually exists.
export function edgeSetsFromCatalog(catalog: TileCatalog): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {}
  for (const t of catalog.tiles) {
    if (t.role !== 'edge' && t.role !== 'corner') continue
    if (!t.side) continue
    ;(out[t.tile_type] ||= {})[t.side] = true
  }
  return out
}
