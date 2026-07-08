// Build a Tile Catalog from the ground tiles the author mapped in the Ground
// Tiles tool (#107 fix). The editor used to bake against MEADOW_CATALOG — a
// fixture with illustrative atlas coords — so the preview showed the wrong
// tiles. Baking against the *real* /api/v1/ground_tiles makes the preview blit
// exactly the cells the author tagged, which is what /maps/<slug> will render.
//
// ADR-0004: the Tile Catalog is the shared kernel. Terrain priority (`stack`)
// is now persisted data (#120) served from /api/v1/terrains; the caller passes
// it in as `priority` and the stack (palette order + seam ownership) is derived
// from it — no hardcoded order here.

import { tilesetUrl } from '../groundTiles/tilesets.js'
import type { GroundTile } from '../groundTiles/schema.ts'

// The catalog assembly itself lives in the kernel (#171) — the live hometown
// producer builds the same catalog from the same data, so it is re-exported
// here for the editor's callers.
export { catalogFromGroundTiles } from '../game/phaser/tileCatalog.ts'

// The image column count a sheet needs for `frame = row*cols + col`, read from
// the loaded PNG exactly as the runtime does (image.width / cell). Best-effort:
// a sheet that fails to load resolves to 1 rather than blocking the editor.
function loadCols(tileset: string, cell: number): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(Math.max(1, Math.floor(img.naturalWidth / cell)))
    img.onerror = () => resolve(1)
    img.src = tilesetUrl(tileset)
  })
}

// Load the column count of every sheet the ground tiles reference, so the bake
// can compute real frame indices before Phaser ever loads the images.
export async function colsForGroundTiles(tiles: readonly GroundTile[]): Promise<Record<string, number>> {
  const byTileset = new Map(tiles.map((t) => [t.tileset, t.cell]))
  const entries = await Promise.all(
    [...byTileset].map(async ([name, cell]) => [name, await loadCols(name, cell)] as const),
  )
  return Object.fromEntries(entries)
}
