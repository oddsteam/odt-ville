// Baked-map presentation. The second producer's render path (ADR-0004): an
// authored map arrives already baked (ADR-0003), so this never autotiles — it
// blits the concrete (tileset, frame) cells the producer resolved. The pure
// `bakedDrawList` flattens a BakedMap into draw instructions (unit-tested apart
// from Phaser); `preloadBakedMap` / `renderBakedMap` load and stamp them.

import { TILE } from '../constants.js'
import type { BakedMap } from '../../maps/schema.ts'

// The Phaser scene, structurally — we touch only a handful of fields, so the
// scene stays loose (same convention as townRenderer).
type Scene = any

// A single stamp instruction: which texture/frame, at which tile coordinate.
export interface BakedDraw {
  x: number
  y: number
  key: string
  frame: number
}

// Texture key for a baked tileset spritesheet. The frame index addresses the
// cell within it, exactly as the ground-tile renderer keys `gtset.<name>`.
export const bakedTextureKey = (tileset: string) => `bake.${tileset}`

// Flatten a baked map into ground + entity draw instructions. This is the whole
// "render the baked tiles" rule: a 1:1 walk of the baked grid and entity list,
// with no neighbour inspection — autotiling already happened in the producer.
export function bakedDrawList(map: BakedMap): { tiles: BakedDraw[]; entities: BakedDraw[] } {
  const tiles: BakedDraw[] = []
  map.tiles.forEach((rowCells, y) => {
    rowCells.forEach((cell, x) => {
      if (!cell) return // transparent cell — paint nothing
      tiles.push({ x, y, key: bakedTextureKey(cell.tileset), frame: cell.frame })
    })
  })

  const entities: BakedDraw[] = map.entities.map((e) => ({
    x: e.x,
    y: e.y,
    key: bakedTextureKey(e.tileset),
    frame: e.frame,
  }))

  return { tiles, entities }
}

// Load every tileset the baked map references, once each, as a uniform
// spritesheet keyed by `bake.<name>`. The scene stashes the map on itself so
// render() can read it back (mirrors townRenderer's preload→create handoff).
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
}

// Stamp the baked map: ground cells at depth 0, entities just above so props
// sit over the ground. Each cell is drawn at TILE resolution regardless of the
// source cell px, matching the town's fixed render scale.
export function renderBakedMap(scene: Scene) {
  const map: BakedMap | null = scene._bakedMap
  if (!map) return
  const { tiles, entities } = bakedDrawList(map)

  const stamp = (d: BakedDraw, depth: number) => {
    if (!scene.textures.exists(d.key)) return
    scene.add
      .image(d.x * TILE, d.y * TILE, d.key, d.frame)
      .setOrigin(0, 0)
      .setDepth(depth)
      .setDisplaySize(TILE, TILE)
  }

  for (const t of tiles) stamp(t, 0)
  for (const e of entities) stamp(e, 1)

  // Size the world to the authored grid so the camera can frame it.
  const worldW = map.cols * TILE
  const worldH = map.rows * TILE
  scene.cameras?.main?.setBounds(0, 0, worldW, worldH)
  scene.cameras?.main?.centerOn(worldW / 2, worldH / 2)
}
