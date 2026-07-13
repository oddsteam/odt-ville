import { TILE } from '../constants.js'
import {
  POSTURE_KEYS,
  resolveSheetSrc,
  framesForFacing,
} from '../../kernel/characterManifest.js'

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
      charDir[d] = {
        walkAnimKey: null,
        walkFrame: null,
        walkFlip: false,
        idleAnimKey: null,
        idleFrame: null,
        idleFlip: false,
        climbAnimKey: null,
        climbFrame: null,
        climbFlip: false,
      }
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

  // A looping anim for every posture with 2+ frames — idle as well as walk, so
  // a multi-frame idle (breathing/blink) animates instead of freezing on frame
  // 0. Single-frame postures stay static (shown via setFrame).
  const frameRate = manifest.frameRate || 9
  for (const slot of POSTURE_KEYS) {
    const rects = manifest.postures?.[slot] || []
    if (rects.length < 2) continue
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
    const climb = framesForFacing(manifest, d, 'climb')

    const walkAnimKey = walk.frames.length > 1 ? `char.anim.${walk.slot}` : null
    const walkFrame = walk.frames.length ? `${walk.slot}.0` : null

    // Idle: loop when the posture has 2+ frames, else a static frame. With no
    // idle art, fall back to the walk posture's first frame.
    let idleFrame = null
    let idleFlip = idle.flipX
    let idleAnimKey = null
    if (idle.frames.length) {
      idleFrame = `${idle.slot}.0`
      if (idle.frames.length > 1) idleAnimKey = `char.anim.${idle.slot}`
    } else if (walk.frames.length) {
      idleFrame = `${walk.slot}.0`
      idleFlip = walk.flipX
    }

    // Climb (#54): play authored climb frames on a ladder cell; with none,
    // borrow the walk anim/frame/flip so a non-climbing character just walks.
    const climbHas = climb.frames.length > 0
    charDir[d] = {
      walkAnimKey,
      walkFrame,
      walkFlip: walk.flipX,
      idleAnimKey,
      idleFrame,
      idleFlip,
      climbAnimKey: climbHas ? (climb.frames.length > 1 ? `char.anim.${climb.slot}` : null) : walkAnimKey,
      climbFrame: climbHas ? `${climb.slot}.0` : walkFrame,
      climbFlip: climbHas ? climb.flipX : walk.flipX,
    }
  }
  return { usingManifest, charDir }
}

// On-screen scale for the manifest sprite (render.scale × tile-basis ratio).
export function characterScale(manifest) {
  const render = manifest?.render || {}
  return (render.scale || 1) * (TILE / CHAR_TILE_BASIS)
}

// Point the manifest sprite the right way. `walking` plays the walk loop —
// swapped for the climb loop when `climbing` (on a ladder, #54); when standing
// we play the idle loop (multi-frame idle) or snap to its idle frame.
// Single-frame postures fall back to a static frame. Directions with no own
// frames were resolved to the down posture (flipped, for left) in the rig.
export function applyFacing(player, charDir, dir, walking, climbing) {
  if (!player?.anims || !charDir) return
  const cfg = charDir[dir]
  if (!cfg) return
  // On a ladder (#54) the walk loop becomes the climb loop; standing still is
  // always idle (climbing only replaces the moving pose).
  const useClimb = walking && climbing
  const animKey = useClimb ? cfg.climbAnimKey : walking ? cfg.walkAnimKey : cfg.idleAnimKey
  const flip = useClimb ? cfg.climbFlip : walking ? cfg.walkFlip : cfg.idleFlip
  const frame = useClimb ? cfg.climbFrame : walking ? cfg.walkFrame : cfg.idleFrame
  player.setFlipX(flip)
  if (animKey) {
    player.anims.play(animKey, true)
  } else {
    player.anims.stop()
    if (frame) player.setFrame(frame)
  }
}
