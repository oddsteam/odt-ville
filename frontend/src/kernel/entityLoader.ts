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

// Texture key for a referenced object's foreground mask (#36, #168): the PNG
// whose alpha selects which of the object's pixels render *over* the avatar (the
// walk-behind canopy). Keyed apart from the art so the map renderer can clip a
// second, depth-bumped copy of `obj.<id>` to it. Only objects carrying an
// `fg_mask` register one.
export const objectForegroundKey = (id: number) => `objfg.${id}`

// Animation key for a referenced object's frame strip (#435, ADR-0019). Derived
// from the object id, so every placement of one animated object shares a single
// registered animation rather than one per stamp.
export const objectAnimKey = (id: number) => `${objectTextureKey(id)}.loop`

// Frames per second for a strip that authored none — the pack's animated
// objects are drawn at roughly this rate.
export const DEFAULT_FPS = 12

// What the loader needs off a fetched tile object to register + size it. Both
// producers hand it objects in this shape (a full TileObject satisfies it). The
// optional `fg_mask` is a PNG data URL (#36) present only on objects with a
// walk-behind overlay — absent/null leaves the object art-only.
export interface EntityObject {
  id: number
  image: string
  footprint_w: number
  footprint_h: number
  fg_mask?: string | null
  // Animated art (#435, ADR-0019): `image` is a horizontal frame strip of
  // `frame_count` frames when > 1, played at `fps`. Absent/1 is a still image —
  // the loader takes the pre-#435 path unchanged.
  frame_count?: number | null
  fps?: number | null
  playback?: string | null
}

// A resolved stamp: a texture (key + frame) at a tile position, covering w×h
// tiles at a depth, anchored by its origin. Producers set the depth/anchor
// policy — the authored map stamps top-left at a flat depth; the town bottom-
// anchors and y-sorts its trees — so the kernel carries both as fields.
export interface EntityDraw {
  key: string
  // A frame index into a uniform spritesheet, or the name of a frame the caller
  // registered on the texture (a character rig's sliced sheet, #294).
  frame?: number | string
  x: number
  y: number
  w?: number
  h?: number
  depth: number
  originX?: number
  originY?: number
}

// Pixel size declared in a PNG data URL's IHDR header — width and height are
// two big-endian ints at bytes 16 and 20, so the first 24 bytes are enough.
// `preload()` needs the strip's dimensions synchronously, before any decode.
// Null for art that isn't a readable PNG data URL, which keeps it a still.
function pngSize(dataUrl: string): { w: number; h: number } | null {
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) return null
  const head = atob(dataUrl.slice(prefix.length, prefix.length + 32))
  if (head.length < 24) return null
  const int32 = (at: number) =>
    ((head.charCodeAt(at) << 24) | (head.charCodeAt(at + 1) << 16) | (head.charCodeAt(at + 2) << 8) | head.charCodeAt(at + 3)) >>> 0
  return { w: int32(16), h: int32(20) }
}

// Register each object's image as an `obj.<id>` texture. Best-effort per object
// (a reference whose object was deleted carries no image); call in preload().
//
// An animated object (#435, ADR-0019) carries a frame strip instead: it loads
// as a spritesheet whose frame size is derived from the *image* — imageWidth /
// frame_count × imageHeight — never from the float footprint. Its animation
// spec is stashed on the scene, keyed by texture, so `stampEntity` can play it
// in create() without either producer having to carry animation through its
// draw list. `frame_count: 1` takes the still path, byte-identical to pre-#435.
export function loadObjectTextures(scene: Scene, objects: readonly EntityObject[]) {
  for (const o of objects) {
    if (!o?.image) continue
    const key = objectTextureKey(o.id)
    const frameCount = o.frame_count ?? 1
    const size = frameCount > 1 ? pngSize(o.image) : null
    if (!size) {
      scene.load.image(key, o.image)
      continue
    }
    scene.load.spritesheet(key, o.image, {
      frameWidth: size.w / frameCount,
      frameHeight: size.h,
    })
    scene._objectAnims ??= new Map()
    scene._objectAnims.set(key, {
      animKey: objectAnimKey(o.id),
      frames: Array.from({ length: frameCount }, (_, frame) => ({ key, frame })),
      fps: o.fps ?? DEFAULT_FPS,
    })
  }
}

// Register each object's foreground mask as an `objfg.<id>` texture (#168),
// alongside its art. Best-effort per object (only objects with a walk-behind
// overlay carry an `fg_mask`); call in preload() so renderBakedMap can clip a
// masked copy over the avatar.
export function loadObjectForegroundTextures(scene: Scene, objects: readonly EntityObject[]) {
  for (const o of objects) {
    if (o?.fg_mask) scene.load.image(objectForegroundKey(o.id), o.fg_mask)
  }
}

// Stamp one resolved draw, or nothing when its texture never loaded (a dangling
// reference draws nothing — ADR-0008). Returns the created image so a producer
// can bucket it for the dev-layer inspector.
export function stampEntity(scene: Scene, d: EntityDraw) {
  if (!scene.textures.exists(d.key)) return null
  // A frame strip (#435) stamps a sprite so it can play its loop; everything
  // else stamps the same still image it always did.
  const anim = scene._objectAnims?.get(d.key)
  const stamp = (
    anim
      ? scene.add.sprite(d.x * TILE, d.y * TILE, d.key)
      : scene.add.image(d.x * TILE, d.y * TILE, d.key, d.frame ?? 0)
  )
    .setOrigin(d.originX ?? 0, d.originY ?? 0)
    .setDepth(d.depth)
    .setDisplaySize((d.w ?? 1) * TILE, (d.h ?? 1) * TILE)
  if (!anim) return stamp
  // One animation per object id, registered on first stamp: two placements of
  // the same object share it.
  if (!scene.anims.exists(anim.animKey)) {
    scene.anims.create({ key: anim.animKey, frames: anim.frames, frameRate: anim.fps, repeat: -1 })
  }
  return stamp.play(anim.animKey)
}
