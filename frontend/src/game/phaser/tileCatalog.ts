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
// Carries no art: the hometown still renders through townRenderer, which reads
// the live ground-tile registry. (Converging it onto the baker is #81.)
export const HOMETOWN_CATALOG: TileCatalog = makeCatalog([
  { type: 'road' },
  { type: 'dirt', autotiled: true },
  { type: 'grass', autotiled: true },
])

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
