// Baked-map presentation. The second producer's render path (ADR-0004): an
// authored map arrives already baked (ADR-0003), so this never autotiles — it
// blits the concrete cells the producer resolved. The pure `bakedDraws`
// flattens a BakedMap into draw instructions (unit-tested apart from Phaser);
// `preloadBakedMap` / `renderBakedMap` load and stamp them.

import { TILE } from './constants.ts'
import type { BakedGround, BakedMap } from './schema.ts'
import {
  loadObjectTextures,
  loadObjectForegroundTextures,
  objectTextureKey,
  objectForegroundKey,
  stampEntity,
} from './entityLoader.ts'

// Re-exported for this module's consumers: the shared prop catalog's texture
// key now lives in the kernel entity loader (ADR-0008), shared with the town.
export { objectTextureKey }

// The Phaser scene, structurally — we touch only a handful of fields, so the
// scene stays loose (same convention as townRenderer).
type Scene = any

// A single stamp instruction: which texture/frame, at which tile coordinate,
// covering w×h tiles (absent = one tile, the ground-cell case). An entity whose
// object carries a foreground mask (#168) also carries `fgMaskKey`/`fgDepth`: the
// renderer draws a second, mask-clipped copy of `key` at `fgDepth` so the
// object's canopy renders over the avatar on its footprint (the walk-behind band).
export interface BakedDraw {
  x: number
  y: number
  key: string
  frame: number
  w?: number
  h?: number
  fgMaskKey?: string
  fgDepth?: number
}

// Texture key for a baked tileset spritesheet. The frame index addresses the
// cell within it, exactly as the ground-tile renderer keys `gtset.<name>`.
export const bakedTextureKey = (tileset: string) => `bake.${tileset}`

// The depth every placed entity's sprite sits at (just above the ground stacks).
// The avatar normally draws above this band; an overhang 'o' cell drops it just
// below so the object's art overhangs the avatar (walk-under, #210).
export const MAP_ENTITY_DEPTH = 1

// The depth an object's foreground overlay draws at (#168): just above the base
// art (MAP_ENTITY_DEPTH) so the masked canopy covers the avatar while it stands
// on the footprint — the avatar drops to MAP_PLAYER_FOREGROUND_DEPTH there,
// between the two — but the avatar's default depth (MAP_PLAYER_DEPTH) beats the
// overlay once south of the footprint. This is the map path's flat-depth
// counterpart to town's buildingOverlayDepth ((row+h)*10 + 2) south band.
export const MAP_ENTITY_FG_DEPTH = MAP_ENTITY_DEPTH + 1

// What the draw list needs off a fetched object — structural, so the pure
// part is testable without full TileObjects. `fg_mask` (a PNG data URL, #36)
// is present only on objects carrying a walk-behind overlay.
export interface ObjectArt {
  footprint_w: number
  footprint_h: number
  fg_mask?: string | null
}

// Flatten a baked *ground* (the Map Baker's autotiled output) into draw
// instructions carrying their resolved depth: a 1:1 walk with no neighbour
// inspection — every layer the producer stacked in a cell becomes one stamp.
// The runtime applies no autotile logic (ADR-0003).
export function groundDrawList(ground: BakedGround): Array<BakedDraw & { depth: number }> {
  const out: Array<BakedDraw & { depth: number }> = []
  ground.cells.forEach((row, y) => {
    row.forEach((layers, x) => {
      for (const layer of layers) {
        out.push({ x, y, key: bakedTextureKey(layer.tileset), frame: layer.frame, depth: layer.depth })
      }
    })
  })
  return out
}

// Every stamp for a baked map, ground beneath entities. A painted map carries
// autotiled `ground` (layer stacks with resolved depths); a flat map carries
// single-cell `tiles` (drawn at depth 0). Entities always sit above at depth 1,
// referencing art one of two ways (ADR-0008): `object_id` stamps the fetched
// object's texture at its footprint — a dangling reference (deleted object)
// draws nothing — and the legacy `tileset`+`frame` pair stamps its 1×1 sheet
// cell (the seed's fixture maps).
export function bakedDraws(
  map: BakedMap,
  objects?: ReadonlyMap<number, ObjectArt>,
): Array<BakedDraw & { depth: number }> {
  const tiles: BakedDraw[] = []
  map.tiles.forEach((rowCells, y) => {
    rowCells.forEach((cell, x) => {
      if (!cell) return // transparent cell — paint nothing
      tiles.push({ x, y, key: bakedTextureKey(cell.tileset), frame: cell.frame })
    })
  })
  const ground = map.ground ? groundDrawList(map.ground) : tiles.map((t) => ({ ...t, depth: 0 }))

  const entities: Array<BakedDraw & { depth: number }> = []
  for (const e of map.entities) {
    if (e.object_id != null) {
      const obj = objects?.get(e.object_id)
      if (!obj) continue
      entities.push({
        x: e.x,
        y: e.y,
        key: objectTextureKey(e.object_id),
        frame: 0,
        depth: MAP_ENTITY_DEPTH,
        w: obj.footprint_w,
        h: obj.footprint_h,
        // An object with a foreground mask (#168) also stamps a second copy of
        // its art, clipped to the mask and depth-bumped over the avatar's band.
        ...(obj.fg_mask
          ? { fgMaskKey: objectForegroundKey(e.object_id), fgDepth: MAP_ENTITY_FG_DEPTH }
          : {}),
      })
    } else if (e.tileset != null && e.frame != null) {
      entities.push({ x: e.x, y: e.y, key: bakedTextureKey(e.tileset), frame: e.frame, depth: MAP_ENTITY_DEPTH, w: 1, h: 1 })
    }
  }
  return [...ground, ...entities]
}

// Load every texture the baked map references, once each: the tilesets as
// uniform spritesheets keyed `bake.<name>`, and the fetched tile objects
// (registry `bakedObjects`, ADR-0008) as images keyed `obj.<id>` from their
// data URLs. The scene stashes both on itself so render() can read them back
// (mirrors townRenderer's preload→create handoff).
export function preloadBakedMap(scene: Scene) {
  const map: BakedMap | null = scene.registry.get('bakedMap') || null
  scene._bakedMap = map
  if (!map) return
  const seen = new Set<string>()
  for (const ts of map.tilesets) {
    const key = bakedTextureKey(ts.name)
    if (seen.has(key)) continue
    seen.add(key)
    scene.load.spritesheet(key, `/maps/tilesets/${ts.name}.png`, {
      frameWidth: ts.cell,
      frameHeight: ts.cell,
    })
  }
  const objects: Array<{
    id: number
    image: string
    footprint_w: number
    footprint_h: number
    fg_mask?: string | null
  }> = scene.registry.get('bakedObjects') || []
  scene._bakedObjects = objects
  loadObjectTextures(scene, objects)
  // The walk-behind overlay masks (#168), keyed objfg.<id> alongside the art.
  loadObjectForegroundTextures(scene, objects)
}

// Stamp the baked map: ground cells at depth 0, entities just above so props
// sit over the ground. Each stamp covers its draw's w×h tiles at TILE
// resolution regardless of the source px, matching the town's fixed scale.
export function renderBakedMap(scene: Scene) {
  const map: BakedMap | null = scene._bakedMap
  if (!map) return
  const objects = new Map<number, ObjectArt>(
    (scene._bakedObjects || []).map((o: { id: number } & ObjectArt) => [o.id, o]),
  )

  for (const d of bakedDraws(map, objects)) {
    stampEntity(scene, d)
    // A second, mask-clipped copy of the object art over the avatar's band (#168)
    // — WebGL-only; on the Canvas renderer stampForeground drops it cleanly.
    if (d.fgMaskKey) stampForeground(scene, d)
  }

  // Size the world to the authored grid so the camera can frame it.
  const worldW = map.cols * TILE
  const worldH = map.rows * TILE
  scene.cameras?.main?.setBounds(0, 0, worldW, worldH)
  scene.cameras?.main?.centerOn(worldW / 2, worldH / 2)
}

// Stamp an object's foreground overlay (#168): a second copy of its art clipped
// to the fg mask (`fgMaskKey`) and drawn at `fgDepth`, above the base sprite so
// the canopy covers the avatar on the footprint. Mirrors townRenderer's building
// overlay: Phaser 4 dropped BitmapMask, so the clip is an internal Mask filter
// that multiplies the overlay's alpha by the mask texture's. Filters are
// WebGL-only — on the Canvas renderer `enableFilters` leaves `filters` unset, so
// we drop the overlay and fall back to the single-depth base sprite. Nothing to
// draw when either texture never loaded (a dangling reference / missing mask).
function stampForeground(scene: Scene, d: BakedDraw & { depth: number }) {
  if (!d.fgMaskKey || !scene.textures.exists(d.key) || !scene.textures.exists(d.fgMaskKey)) return
  const overlay = scene.add
    .image(d.x * TILE, d.y * TILE, d.key, d.frame ?? 0)
    .setOrigin(0, 0)
    .setDepth(d.fgDepth ?? MAP_ENTITY_FG_DEPTH)
    .setDisplaySize((d.w ?? 1) * TILE, (d.h ?? 1) * TILE)
  overlay.enableFilters?.()
  if (overlay.filters) overlay.filters.internal.addMask(d.fgMaskKey)
  else overlay.destroy()
}
