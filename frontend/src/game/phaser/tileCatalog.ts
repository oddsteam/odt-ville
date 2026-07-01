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
// `role` is 'fill' | 'edge' | 'corner' | 'inner'; `side` is null for fill, an
// orthogonal direction (N/E/S/W) for edges, and a diagonal (NE/NW/SE/SW) for
// outer corners and inner (concave) corners. Mirrors the GroundTile record.
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

// Order a set of terrain types by a priority list, low→high (higher owns the
// seam). Types absent from the list sort *after* the known ones, keeping their
// first-seen order (JS sort is stable). This is the one place seam ownership is
// derived; both producers feed it their priority *data* (#120) instead of a
// hardcoded stack.
export function orderByPriority(types: readonly string[], priority: readonly string[]): string[] {
  const rank = (t: string) => {
    const i = priority.indexOf(t)
    return i === -1 ? priority.length : i
  }
  return [...types].sort((a, b) => rank(a) - rank(b))
}

// Build a catalog from concrete art (tilesets + atlas tiles) plus a priority
// list — the shared core both the town producer and the map editor use. The
// stack is the art's terrains ordered by priority; a terrain autotiles where it
// carries edge/corner/inner art. Only terrains the art references appear, so an
// unused priority entry (e.g. a terrain with no tiles) never shifts depths.
export function catalogFromArt(
  tiles: CatalogArtTile[],
  tilesets: CatalogTileset[],
  priority: readonly string[],
): TileCatalog {
  const types = [...new Set(tiles.map((t) => t.tile_type))]
  return {
    stack: orderByPriority(types, priority),
    autotiled: new Set(
      tiles.filter((t) => t.role === 'edge' || t.role === 'corner' || t.role === 'inner').map((t) => t.tile_type),
    ),
    tilesets,
    tiles,
  }
}

// The generated hometown's terrain art (#81): the bundled terrain sheet's
// road/dirt/grass fills plus grass's edge/corner transitions, so the hometown
// producer (townMap.ts) bakes its ground through the SAME shared engine the
// authored map uses (ADR-0003/0004) — autotiling resolved once, in the producer,
// never at runtime. grass owns every seam in the town (it ranks highest and the
// field is grass-margined), so dirt/road need only a flat fill. Atlas
// coordinates mirror the meadow fixture's illustrative cells on the bundled
// 1_Terrains_and_Fences_32x32 sheet (32 columns).
const HOMETOWN_SHEET = '1_Terrains_and_Fences_32x32'
const HOMETOWN_TILESETS: CatalogTileset[] = [{ name: HOMETOWN_SHEET, cell: 32, cols: 32 }]
const HOMETOWN_TILES: CatalogArtTile[] = [
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
]

// The hometown catalog for a given terrain priority (#120): the fixed hometown
// art resolved against data-driven priority. The town producer's bake path calls
// this with the persisted order instead of a hardcoded stack.
export function hometownCatalog(priority: readonly string[]): TileCatalog {
  return catalogFromArt(HOMETOWN_TILES, HOMETOWN_TILESETS, priority)
}

// The generated hometown's catalog — the data equivalent of the old hardcoded
// constants. road (opaque base) < dirt < grass (top); grass + dirt autotile.
// The live townRenderer reads the registry catalog and is untouched; this
// constant backs that legacy runtime path and its unit tests.
export const HOMETOWN_CATALOG: TileCatalog = makeCatalog(
  [{ type: 'road' }, { type: 'dirt', autotiled: true }, { type: 'grass', autotiled: true }],
  { tilesets: HOMETOWN_TILESETS, tiles: HOMETOWN_TILES },
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

// The inner-corner counterpart of `edgeSetsFromCatalog`: `{ terrain: { side } }`
// for every terrain carrying `inner` (concave) art. Kept separate from edgeSets
// because inner + outer corners share diagonal side names (NE/NW/SE/SW) but are
// different tiles. A terrain only autotiles a concave corner for which art exists.
export function innerSetsFromCatalog(catalog: TileCatalog): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {}
  for (const t of catalog.tiles) {
    if (t.role !== 'inner' || !t.side) continue
    ;(out[t.tile_type] ||= {})[t.side] = true
  }
  return out
}
