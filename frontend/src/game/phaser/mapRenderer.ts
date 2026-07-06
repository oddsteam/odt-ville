// Baked-map presentation. The second producer's render path (ADR-0004): an
// authored map arrives already baked (ADR-0003), so this never autotiles — it
// blits the concrete cells the producer resolved. The pure `bakedDraws`
// flattens a BakedMap into draw instructions (unit-tested apart from Phaser);
// `preloadBakedMap` / `renderBakedMap` load and stamp them.

import { TILE } from '../constants.js'
import type { BakedGround, BakedMap } from '../../maps/schema.ts'

// The Phaser scene, structurally — we touch only a handful of fields, so the
// scene stays loose (same convention as townRenderer).
type Scene = any

// A single stamp instruction: which texture/frame, at which tile coordinate,
// covering w×h tiles (absent = one tile, the ground-cell case).
export interface BakedDraw {
  x: number
  y: number
  key: string
  frame: number
  w?: number
  h?: number
}

// Texture key for a baked tileset spritesheet. The frame index addresses the
// cell within it, exactly as the ground-tile renderer keys `gtset.<name>`.
export const bakedTextureKey = (tileset: string) => `bake.${tileset}`

// Texture key for a referenced tile object (ADR-0008) — the shared prop
// catalog. The map stores only `object_id`; the object's image data URL is
// fetched by id (#138) and registered under this key.
export const objectTextureKey = (id: number) => `obj.${id}`

// What the draw list needs off a fetched object — structural, so the pure
// part is testable without full TileObjects.
export interface ObjectArt {
  footprint_w: number
  footprint_h: number
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
        depth: 1,
        w: obj.footprint_w,
        h: obj.footprint_h,
      })
    } else if (e.tileset != null && e.frame != null) {
      entities.push({ x: e.x, y: e.y, key: bakedTextureKey(e.tileset), frame: e.frame, depth: 1, w: 1, h: 1 })
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
  const objects: Array<{ id: number; image: string; footprint_w: number; footprint_h: number }> =
    scene.registry.get('bakedObjects') || []
  scene._bakedObjects = objects
  for (const o of objects) scene.load.image(objectTextureKey(o.id), o.image)
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

  const stamp = (d: BakedDraw, depth: number) => {
    if (!scene.textures.exists(d.key)) return
    scene.add
      .image(d.x * TILE, d.y * TILE, d.key, d.frame)
      .setOrigin(0, 0)
      .setDepth(depth)
      .setDisplaySize(TILE * (d.w ?? 1), TILE * (d.h ?? 1))
  }

  for (const d of bakedDraws(map, objects)) stamp(d, d.depth)

  // Size the world to the authored grid so the camera can frame it.
  const worldW = map.cols * TILE
  const worldH = map.rows * TILE
  scene.cameras?.main?.setBounds(0, 0, worldW, worldH)
  scene.cameras?.main?.centerOn(worldW / 2, worldH / 2)
}
