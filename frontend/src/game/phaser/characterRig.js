import { TILE } from '../constants.js'
import {
  POSTURE_KEYS,
  resolveSheetSrc,
  framesForFacing,
} from '../../character/manifest.js'

// Shared "character rig" for the manifest-driven player (sprite-mapper). Both
// TownScene and InteriorScene render the active character from the same sheet,
// so the frame-slicing, walk-anim building, and facing logic live here once.
//
// Phaser textures and anims are global to a game instance: TownScene (the boot
// scene) builds them first, and InteriorScene reuses the same CHAR_SHEET_KEY
// texture + char.anim.* anims. buildCharacterRig() is idempotent (it guards on
// already-present frames/anims) so every scene can safely call it.

export const CHAR_SHEET_KEY = 'char.sheet'

// The sprite-mapper authors characters against a 32-px tile grid; the game
// renders at TILE (48). Scaling by this ratio keeps the character's size
// relative to a tile identical to the map-preview's (drawn at scale 1 on a
// 32-px tile) — e.g. scout's 32×64 frame becomes 48×96 = 2 tiles tall.
const CHAR_TILE_BASIS = 32

// Read the active manifest from the registry and queue its sheet for loading.
// Call in a scene's preload(); returns the manifest (or null). The texture is
// loaded once and shared, so a second scene's call is a no-op.
export function preloadCharacter(scene) {
  const manifest = scene.registry.get('characterManifest') || null
  const src = manifest ? resolveSheetSrc(manifest) : ''
  if (src && !scene.textures.exists(CHAR_SHEET_KEY)) {
    scene.load.image(CHAR_SHEET_KEY, src)
  }
  return manifest
}

// Slice the manifest sheet into named frames, build a looping walk anim per
// posture, and compute a per-direction { animKey, idleFrame, flips } lookup
// (idle→walk and dir→down fallbacks). Returns { usingManifest, charDir };
// usingManifest is false (and charDir all-null) when there's no manifest or its
// sheet failed to load, so the caller falls back to the bundled player frames.
export function buildCharacterRig(scene, manifest) {
  const charDir = { down: {}, up: {}, left: {}, right: {} }
  const usingManifest = Boolean(manifest && scene.textures.exists(CHAR_SHEET_KEY))
  if (!usingManifest) {
    for (const d of Object.keys(charDir)) {
      charDir[d] = { animKey: null, idleFrame: null, walkFlip: false, idleFlip: false }
    }
    return { usingManifest, charDir }
  }

  const tex = scene.textures.get(CHAR_SHEET_KEY)
  for (const slot of POSTURE_KEYS) {
    ;(manifest.postures?.[slot] || []).forEach((r, i) => {
      const name = `${slot}.${i}`
      if (!tex.has(name)) tex.add(name, 0, r.x, r.y, r.w, r.h)
    })
  }

  const frameRate = manifest.frameRate || 9
  for (const slot of POSTURE_KEYS) {
    if (!slot.startsWith('walk')) continue
    const rects = manifest.postures?.[slot] || []
    if (!rects.length) continue
    const key = `char.anim.${slot}`
    if (!scene.anims.exists(key)) {
      scene.anims.create({
        key,
        frames: rects.map((_, i) => ({ key: CHAR_SHEET_KEY, frame: `${slot}.${i}` })),
        frameRate,
        repeat: -1,
      })
    }
  }

  for (const d of Object.keys(charDir)) {
    const walk = framesForFacing(manifest, d, 'walk')
    const idle = framesForFacing(manifest, d, 'idle')
    let idleFrame = null
    let idleFlip = idle.flipX
    if (idle.frames.length) {
      idleFrame = `${idle.slot}.0`
    } else if (walk.frames.length) {
      idleFrame = `${walk.slot}.0`
      idleFlip = walk.flipX
    }
    charDir[d] = {
      animKey: walk.frames.length ? `char.anim.${walk.slot}` : null,
      walkFlip: walk.flipX,
      idleFrame,
      idleFlip,
    }
  }
  return { usingManifest, charDir }
}

// On-screen scale for the manifest sprite (render.scale × tile-basis ratio).
export function characterScale(manifest) {
  const render = manifest?.render || {}
  return (render.scale || 1) * (TILE / CHAR_TILE_BASIS)
}

// Point the manifest sprite the right way: `walking` plays that direction's
// loop (if any); otherwise snap to its idle frame. Directions with no own
// frames were resolved to the down posture (flipped, for left) in the rig.
export function applyFacing(player, charDir, dir, walking) {
  if (!player?.anims || !charDir) return
  const cfg = charDir[dir]
  if (!cfg) return
  if (walking && cfg.animKey) {
    player.setFlipX(cfg.walkFlip)
    player.anims.play(cfg.animKey, true)
  } else {
    player.anims.stop()
    if (cfg.idleFrame) {
      player.setFlipX(cfg.idleFlip)
      player.setFrame(cfg.idleFrame)
    }
  }
}
