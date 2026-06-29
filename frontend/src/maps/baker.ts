// Map Baker — the producer half of ADR-0003: turn a *source document* (painted
// terrain regions) into *baked tiles* (a concrete, autotile-resolved grid) using
// the shared autotile engine + Tile Catalog. Autotiling happens here, once, at
// author/generation time; the runtime only blits the result (see mapRenderer's
// `groundDrawList`). Pure and Phaser-free, so it is unit-testable apart from the
// game.
//
// Because resolution reads catalog *data* (not engine constants), a brand-new
// terrain — water, floor, wall — bakes correctly the moment it appears in the
// catalog's stack + art, with no change here.

import {
  EDGE_CORNERS,
  ORTHOGONAL_DIRS,
  groundPaintStackForCell,
  terrainBorders,
} from '../game/phaser/groundModel.js'
import { edgeSetsFromCatalog } from '../game/phaser/tileCatalog.ts'
import type { CatalogArtTile, TileCatalog } from '../game/phaser/tileCatalog.ts'
import type { BakedGround, BakedLayer, BakedTileset } from './schema.ts'

// The editable truth a producer/editor saves and re-opens (ADR-0003): identity
// plus painted terrain. Row-major `terrain[row][col]`; null = unpainted, which
// bakes to nothing (a transparent cell at the map border, etc.).
export interface SourceMap {
  slug: string
  title: string
  cols: number
  rows: number
  terrain: ReadonlyArray<ReadonlyArray<string | null>>
}

// A terrain field over a source grid: the generic accessor the engine resolves
// against (the town path uses its tile chars instead). Out-of-bounds is null —
// an authored map has no terrain beyond its edge, so its border terrains edge.
function fieldFor(source: SourceMap) {
  return {
    terrainAt(x: number, y: number): string | null {
      if (y < 0 || y >= source.rows || x < 0 || x >= source.cols) return null
      return source.terrain[y]?.[x] ?? null
    },
  }
}

// frame index for an atlas coordinate. The catalog declares each sheet's column
// count, so this is computable offline — the runtime never re-derives it.
function frameFor(art: CatalogArtTile, colsByTileset: Record<string, number>): number {
  const cols = Math.max(1, colsByTileset[art.tileset] ?? 1)
  return art.row * cols + art.col
}

// Index the catalog's art by `${type}|${role}|${side}` for O(1) lookup while
// baking. Fill tiles key under an empty side.
function artIndexFor(catalog: TileCatalog): Map<string, CatalogArtTile> {
  const index = new Map<string, CatalogArtTile>()
  for (const t of catalog.tiles) {
    index.set(`${t.tile_type}|${t.role}|${t.side ?? ''}`, t)
  }
  return index
}

// Resolve one cell to its baked layer stack (autotiling applied). Mirrors the
// renderer's per-cell paint: a coverage fill beneath the terrain's transparent
// edge/corner tiles, the higher-priority terrain owning the seam.
function bakeCell(
  field: { terrainAt(x: number, y: number): string | null },
  x: number,
  y: number,
  catalog: TileCatalog,
  edgeSets: Record<string, Record<string, boolean>>,
  artIndex: Map<string, CatalogArtTile>,
  colsByTileset: Record<string, number>,
): BakedLayer[] {
  const layers: BakedLayer[] = []
  const push = (art: CatalogArtTile | undefined, depth: number) => {
    if (!art) return false
    layers.push({ tileset: art.tileset, frame: frameFor(art, colsByTileset), depth })
    return true
  }

  // groundModel.js is untyped; its `= null` defaults make TS infer null-only
  // params, so the engine boundary takes loose casts (as townRenderer does).
  const plan = groundPaintStackForCell(field, x, y, edgeSets as never, catalog) as Array<{
    terrain: string
    role: string
    depth: number
  }>
  for (const entry of plan) {
    if (entry.role !== 'edge') {
      // fill / coverage — the flat terrain tile at its canonical depth.
      push(artIndex.get(`${entry.terrain}|fill|`), entry.depth)
      continue
    }
    // Transparent edge: pick the concrete corner/edge tiles for the borders the
    // higher terrain owns. A corner consumes its two sides so they don't also
    // draw a flat edge over it.
    const borders = terrainBorders(field, x, y, entry.terrain, catalog) as Record<string, boolean>
    const used = new Set<string>()
    let drew = false
    for (const { c, a, b } of EDGE_CORNERS) {
      if (borders[a] && borders[b] && push(artIndex.get(`${entry.terrain}|corner|${c}`), entry.depth)) {
        used.add(a)
        used.add(b)
        drew = true
      }
    }
    for (const { d } of ORTHOGONAL_DIRS) {
      if (borders[d] && !used.has(d) && push(artIndex.get(`${entry.terrain}|edge|${d}`), entry.depth)) {
        drew = true
      }
    }
    // No matching edge art for these borders — fall back to the flat fill so the
    // cell is never a hole (matches the renderer's drawOwn fallback).
    if (!drew) push(artIndex.get(`${entry.terrain}|fill|`), entry.depth)
  }
  return layers
}

// The tilesets the baked layers actually reference, as the runtime's
// BakedTileset shape (name + cell).
function referencedTilesets(catalog: TileCatalog, cells: BakedLayer[][][]): BakedTileset[] {
  const used = new Set<string>()
  for (const row of cells) for (const cell of row) for (const layer of cell) used.add(layer.tileset)
  return catalog.tilesets.filter((ts) => used.has(ts.name)).map((ts) => ({ name: ts.name, cell: ts.cell }))
}

// Bake a source's painted terrain into a concrete, autotile-resolved ground
// grid. This is the whole "source -> baked" rule; the runtime renders the result
// with no autotiling (mapRenderer.groundDrawList).
export function bakeGround(source: SourceMap, catalog: TileCatalog): BakedGround {
  const field = fieldFor(source)
  const edgeSets = edgeSetsFromCatalog(catalog)
  const artIndex = artIndexFor(catalog)
  const colsByTileset: Record<string, number> = {}
  for (const ts of catalog.tilesets) colsByTileset[ts.name] = ts.cols

  const cells: BakedLayer[][][] = []
  for (let y = 0; y < source.rows; y++) {
    const row: BakedLayer[][] = []
    for (let x = 0; x < source.cols; x++) {
      row.push(bakeCell(field, x, y, catalog, edgeSets, artIndex, colsByTileset))
    }
    cells.push(row)
  }

  return {
    cols: source.cols,
    rows: source.rows,
    tilesets: referencedTilesets(catalog, cells),
    cells,
  }
}

// The save path (ADR-0003): editing is load source -> edit -> re-bake -> save,
// and *both* artifacts are persisted. This returns the document a producer
// stores — the editable source alongside its baked ground — so the editor reads
// `source` to re-open and the game reads `baked`.
export interface BakedDocument {
  slug: string
  title: string
  cols: number
  rows: number
  ground: BakedGround
}

export function bakeSourceMap(
  source: SourceMap,
  catalog: TileCatalog,
): { source: SourceMap; baked: BakedDocument } {
  const ground = bakeGround(source, catalog)
  return {
    source,
    baked: { slug: source.slug, title: source.title, cols: source.cols, rows: source.rows, ground },
  }
}
