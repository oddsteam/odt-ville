// Baked-map presentation. The second producer's render path (ADR-0004): an
// authored map arrives already baked (ADR-0003), so this never autotiles — it
// blits the concrete cells the producer resolved. The pure `bakedDraws`
// flattens a BakedMap into draw instructions (unit-tested apart from Phaser);
// `preloadBakedMap` / `renderBakedMap` load and stamp them.

import { TILE } from './constants.ts'
import { framesForFacing, characterScale } from './characterManifest.js'
import { queueRigSheet } from './rigSheet.js'
import type { BakedEntity, BakedGround, BakedMap } from './schema.ts'
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
  // A tileset cell is a frame index; a character rig's sheet is sliced at render
  // time, so its stamp names the frame it registers (see `rect`).
  frame: number | string
  w?: number
  h?: number
  fgMaskKey?: string
  fgDepth?: number
  // Ambient animation (#85): a Prop cycling these spritesheet frames at `fps`
  // is stamped as a looping sprite instead of a static image.
  frames?: readonly number[]
  fps?: number
  // A placed NPC (#294) draws one region of its rig's sheet — an uploaded sheet
  // is not a uniform grid, so the region comes with the draw and the renderer
  // registers it under `frame` before stamping. `flipX` is the rig's left-from-
  // down fallback; the anchor is bottom-centre, like the avatar's feet.
  rect?: { x: number; y: number; w: number; h: number }
  flipX?: boolean
  originX?: number
  originY?: number
  // Scale factor for a rig sprite (#295) — its frames differ in size, so the
  // stamp scales source px instead of forcing a display size.
  scale?: number
  // The placed-NPC entity a rig stamp draws, carried through so the runtime can
  // take ownership of the created sprite (#295). Absent on every other draw.
  npc?: BakedEntity
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

// The rig a placed NPC draws from (#294): the character manifest its catalog row
// points at, keyed here by *npc* id — the shell resolves
// npc_id → Catalog::Npc → character_manifest_id → manifest and hands the result
// in (ADR-0004: the black box takes data, it never fetches). Structural, so the
// pure draw list is testable without a real manifest.
export type NpcRig = {
  sheet?: { path?: string; dataUrl?: string }
  render?: { scale?: number }
  postures?: Record<string, ReadonlyArray<{ x: number; y: number; w: number; h: number }>>
}

// Texture key for a placed NPC's rig sheet, alongside `obj.<id>` for props.
export const npcSheetKey = (npcId: number) => `npc.${npcId}`

// Texture key for a Standee's rig sheet (#369, ADR-0015). A Standee is not baked
// into the document — the shell resolves the owner's rig by reference and hands
// the list over the registry (`bakedStandees`), the same boot-input timing as
// `bakedNpcs`; this only names the sheet the runtime loads for it.
export const standeeSheetKey = (standeeId: number) => `standee.${standeeId}`

// One stamp for a placed NPC: the idle frame for its authored facing, resolved
// through the same kernel helper the game's character rig uses, so the pose an
// author sees can't drift from the one the runtime shows. Sized off the frame at
// the sprite-mapper's 32-px basis (a 32×64 frame is one tile wide, two tall) and
// bottom-centre anchored so it stands in its cell. Nothing to draw when the rig
// is missing (dangling npc_id, no rig picked) or has no frames for that pose.
function npcDraw(e: BakedEntity, rig?: NpcRig): (BakedDraw & { depth: number }) | null {
  if (e.npc_id == null || !rig) return null
  const { slot, frames, flipX } = framesForFacing(rig, e.facing ?? 'down', 'idle')
  const rect = frames[0]
  if (!rect) return null
  return {
    x: e.x + 0.5,
    y: e.y + 1,
    key: npcSheetKey(e.npc_id),
    frame: `${slot}.0`,
    rect,
    flipX,
    originX: 0.5,
    originY: 1,
    scale: characterScale(rig),
    depth: MAP_ENTITY_DEPTH,
    // The entity this stamp came from, so the runtime can pair the sprite with
    // the NPC it draws — rig it, animate it, and own its cell from there (#295).
    npc: e,
  }
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
  npcRigs?: ReadonlyMap<number, NpcRig>,
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
    if (e.kind === 'npc') {
      // A placed person (#294) draws from its rig, not from the prop catalog.
      const draw = npcDraw(e, npcRigs?.get(e.npc_id ?? -1))
      if (draw) entities.push(draw)
    } else if (e.object_id != null) {
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
      entities.push({
        x: e.x,
        y: e.y,
        key: bakedTextureKey(e.tileset),
        frame: e.frame,
        depth: MAP_ENTITY_DEPTH,
        w: 1,
        h: 1,
        // An ambient animated prop (#85) carries its frame cycle to the stamp.
        ...(e.frames ? { frames: e.frames, fps: e.fps } : {}),
      })
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
  // The rigs the placed NPCs draw from (#294), keyed npc.<id>: the shell resolves
  // each npc_id to its character manifest and hands them over the registry, the
  // same boot-input timing as `bakedObjects`. An NPC with no rig loads nothing
  // and draws nothing.
  const npcs: Array<{ id: number; manifest: NpcRig | null }> = scene.registry.get('bakedNpcs') || []
  scene._bakedNpcs = npcs
  for (const n of npcs) {
    if (n.manifest) queueRigSheet(scene, n.manifest, npcSheetKey(n.id))
  }
  // Standees (#369, ADR-0015): runtime-placed cutouts the shell resolves by
  // reference and hands over the registry (`bakedStandees`) — read alongside the
  // map, never baked into it, so they load here beside the NPC rigs rather than
  // through bakedDraws. A Standee whose owner has no rig loads nothing; the game
  // layer (mapStandees) draws the bundled fallback for it rather than crashing.
  const standees: Array<{ id: number; manifest: NpcRig | null }> =
    scene.registry.get('bakedStandees') || []
  scene._bakedStandees = standees
  for (const s of standees) {
    if (s.manifest) queueRigSheet(scene, s.manifest, standeeSheetKey(s.id))
  }
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
  const npcRigs = new Map<number, NpcRig>(
    (scene._bakedNpcs || [])
      .filter((n: { manifest: NpcRig | null }) => n.manifest)
      .map((n: { id: number; manifest: NpcRig }) => [n.id, n.manifest]),
  )

  // The placed NPCs' sprites, paired with the entity each draws (#295). The
  // runtime rigs and commands them; the editor preview leaves them as the still
  // frame they were stamped as.
  const npcs: NpcStamp[] = []
  scene._npcSprites = npcs

  for (const d of bakedDraws(map, objects, npcRigs)) {
    if (d.npc) {
      const sprite = stampRig(scene, d)
      if (sprite) npcs.push({ entity: d.npc, sprite })
      continue
    }
    if (d.frames && d.frames.length > 1) stampAnimated(scene, d)
    else {
      registerRigFrame(scene, d)
      stampEntity(scene, d)?.setFlipX(!!d.flipX)
    }
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

// A stamped NPC and the entity it draws (#295), left on the scene for the
// runtime to pick up: a Phaser sprite, so the same object the kernel positioned
// can play its rig's loops and be moved, rather than being redrawn elsewhere.
export interface NpcStamp {
  entity: BakedEntity
  sprite: any
}

// Stamp a placed NPC (#294, #295): a *sprite* — not an image — so the runtime can
// play its rig's idle/walk loops on the very object the kernel placed, scaled
// (never display-sized) because an animating rig's frames differ in size. Its
// sheet region is sliced first, exactly as the avatar's rig slices its own.
// Nothing to draw when the sheet never loaded — a dangling reference, as always.
function stampRig(scene: Scene, d: BakedDraw & { depth: number }) {
  if (!scene.textures.exists(d.key)) return null
  registerRigFrame(scene, d)
  return scene.add
    .sprite(d.x * TILE, d.y * TILE, d.key, d.frame)
    .setOrigin(d.originX ?? 0.5, d.originY ?? 1)
    .setDepth(d.depth)
    .setScale(d.scale ?? 1)
    .setFlipX(!!d.flipX)
}

// Slice a rig sheet region into a named frame before its stamp reads it (#294):
// an uploaded character sheet is not a uniform grid, so the draw carries the
// region — the same tex.add() slicing buildCharacterRig does for the avatar.
// A draw with no rect (a tileset cell, an object image) has nothing to slice, and
// a texture that never loaded is skipped — stampEntity then draws nothing.
function registerRigFrame(scene: Scene, d: BakedDraw) {
  if (!d.rect || !scene.textures.exists(d.key)) return
  const tex = scene.textures.get(d.key)
  if (!tex.has(d.frame)) tex.add(d.frame, 0, d.rect.x, d.rect.y, d.rect.w, d.rect.h)
}

// Stamp an ambient animated prop (#85): a looping sprite cycling the draw's
// spritesheet frames — the renderer-only billboard. The anim key is per
// (sheet, cycle) so two billboards sharing art share one animation; `create`
// is a no-op when the key already exists. Nothing to draw when the texture
// never loaded, same as stampEntity.
function stampAnimated(scene: Scene, d: BakedDraw & { depth: number }) {
  if (!scene.textures.exists(d.key) || !d.frames) return
  const animKey = `ambient.${d.key}.${d.frames.join('-')}`
  scene.anims.create({
    key: animKey,
    frames: d.frames.map((frame) => ({ key: d.key, frame })),
    frameRate: d.fps ?? 2,
    repeat: -1,
  })
  scene.add
    .sprite(d.x * TILE, d.y * TILE, d.key, d.frames[0])
    .setOrigin(0, 0)
    .setDepth(d.depth)
    .setDisplaySize((d.w ?? 1) * TILE, (d.h ?? 1) * TILE)
    .play(animKey)
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
