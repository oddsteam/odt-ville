// Shared entity loader (ADR-0008, #141). Both map producers place props as
// references to saved tile objects — `{kind:"prop", object_id, x, y}` — and the
// generated hometown now resolves its foliage to the same shape. This kernel is
// the one place those references become pixels: register each referenced
// object's image as a texture keyed `obj.<id>`, then stamp a draw at its
// footprint above the ground.
//
// It imports neither producer (ADR-0004 boundary): it knows entities, objects,
// and how to paint them — not towns or baked maps. Producers own the *policy*
// (which depth, which anchor); the kernel owns the *paint*. The pure
// `objectTextureKey` + the draw/object shapes are Phaser-free, so producers and
// tests can resolve references without booting Phaser.

import { TILE } from './constants.ts'

// The Phaser scene, structurally — the loader touches only load/textures/add,
// so the scene stays loose (same convention as town/mapRenderer).
type Scene = any

// Texture key for a referenced tile object — the shared prop catalog. The map
// (or the town producer) stores only `object_id`; the object's image data URL
// is registered under this key so a stamp can address it.
export const objectTextureKey = (id: number) => `obj.${id}`

// What the loader needs off a fetched tile object to register + size it. Both
// producers hand it objects in this shape (a full TileObject satisfies it).
export interface EntityObject {
  id: number
  image: string
  footprint_w: number
  footprint_h: number
}

// A resolved stamp: a texture (key + frame) at a tile position, covering w×h
// tiles at a depth, anchored by its origin. Producers set the depth/anchor
// policy — the authored map stamps top-left at a flat depth; the town bottom-
// anchors and y-sorts its trees — so the kernel carries both as fields.
export interface EntityDraw {
  key: string
  frame?: number
  x: number
  y: number
  w?: number
  h?: number
  depth: number
  originX?: number
  originY?: number
}

// Register each object's image as an `obj.<id>` texture. Best-effort per object
// (a reference whose object was deleted carries no image); call in preload().
export function loadObjectTextures(scene: Scene, objects: readonly EntityObject[]) {
  for (const o of objects) {
    if (o?.image) scene.load.image(objectTextureKey(o.id), o.image)
  }
}

// Stamp one resolved draw, or nothing when its texture never loaded (a dangling
// reference draws nothing — ADR-0008). Returns the created image so a producer
// can bucket it for the dev-layer inspector.
export function stampEntity(scene: Scene, d: EntityDraw) {
  if (!scene.textures.exists(d.key)) return null
  return scene.add
    .image(d.x * TILE, d.y * TILE, d.key, d.frame ?? 0)
    .setOrigin(d.originX ?? 0, d.originY ?? 0)
    .setDepth(d.depth)
    .setDisplaySize((d.w ?? 1) * TILE, (d.h ?? 1) * TILE)
}
