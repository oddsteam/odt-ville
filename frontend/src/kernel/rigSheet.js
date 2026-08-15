// The one place a manifest turns into a texture under a given key (ADR-0017):
// a single sheet image, or a Look's Part atlases composited into one canvas the
// rig slices exactly like a sheet. Shared by every consumer — the player/peer
// character (characterRig) and the placed NPCs + Standees (mapRenderer) — so a
// Look bakes the same for all of them and none can drift back to the stills
// while another wears the recipe. Pure kernel: the scene is duck-typed (real
// Phaser in the game, a stub under test), no Phaser import.

import { resolveSheetSrc } from './characterManifest.js'
import { composeLook } from './composeLook.ts'

// Queue whatever `manifest` needs under `sheetKey`: a sheet image, or a Look's
// Parts to composite. Returns false when it carries neither — the caller then
// falls back to the bundled stills.
export function queueRigSheet(scene, manifest, sheetKey) {
  const src = resolveSheetSrc(manifest)
  if (src) {
    scene.load.image(sheetKey, src)
    return true
  }
  if (manifest?.layout && manifest.parts?.length) {
    preloadLook(scene, manifest, sheetKey)
    return true
  }
  return false
}

// Queue each Part atlas, then on load-complete composite the ones that arrived
// into a canvas under `sheetKey`. A Part that 404s (renamed / dropped from the
// pack) leaves no texture — warn and skip its slot rather than draw a broken
// character; if none arrive, register nothing so the caller keeps the stills.
function preloadLook(scene, manifest, sheetKey) {
  const packDir = `/maps/characters/packs/${manifest.layout.name}/`
  const parts = manifest.parts.map((name) => ({ name, key: `${sheetKey}.part.${name}`, url: `${packDir}${name}.png` }))
  for (const p of parts) {
    if (!scene.textures.exists(p.key)) scene.load.image(p.key, p.url)
  }
  scene.load.once('complete', () => {
    if (scene.textures.exists(sheetKey)) return
    const images = []
    for (const p of parts) {
      if (scene.textures.exists(p.key)) images.push(scene.textures.get(p.key).getSourceImage())
      else console.warn(`Look: Part "${p.name}" not in pack "${manifest.layout.name}" — slot skipped`)
    }
    if (images.length) scene.textures.addCanvas(sheetKey, composeLook(images, manifest.layout))
  })
}
