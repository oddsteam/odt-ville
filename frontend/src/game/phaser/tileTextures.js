// Procedural tile textures for the Phaser town. Phaser scenes don't have
// CSS pseudo-elements to lean on, so each tile chararcter from constants.js
// gets a 48×48 generated texture that approximates the look of the DOM
// engine's `.t-grass`, `.t-path`, `.t-tree`, etc. Generating once at scene
// boot keeps GPU memory tiny (5 textures × 48px) and lets us style with
// the same palette the DOM uses (see :root CSS variables).

const TILE = 48

// GBC-ish palette — same hex codes as styles.css :root.
const PALETTE = {
  grass: 0x5fc24a,
  grassDk: 0x3f9c33,
  tree: 0x2f8c3c,
  treeDk: 0x1c5f27,
  path: 0xf0dca6,
  pathDk: 0xcdb472,
  flowerA: 0xf6c41f,
  flowerB: 0xec5436,
  wall: 0xf3e6bb,
  door: 0x432a14,
  ink: 0x1b241b,
}

// Generate every tile texture into the scene's texture cache.
// Texture keys mirror the tile-char-to-class mapping in <VillageMap>:
//   '.' → 'tile.grass'
//   ':' → 'tile.path'
//   '*' → 'tile.flower'
//   'g' → 'tile.tallgrass'
//   'T' → 'tile.tree'
//   's' → 'tile.sign'
//   'W' boundary trees collapse to 'tile.tree' too.
export function ensureTileTextures(scene) {
  if (scene.textures.exists('tile.grass')) return // already minted

  // Grass: solid green with a 4px darker rim along the bottom.
  drawTile(scene, 'tile.grass', (g) => {
    g.fillStyle(PALETTE.grass, 1)
    g.fillRect(0, 0, TILE, TILE)
    g.fillStyle(0x000000, 0.05)
    g.fillRect(0, TILE - 4, TILE, 4)
  })

  // Path: beige with a 1px darker outline.
  drawTile(scene, 'tile.path', (g) => {
    g.fillStyle(PALETTE.path, 1)
    g.fillRect(0, 0, TILE, TILE)
    g.lineStyle(1, PALETTE.pathDk, 1)
    g.strokeRect(0.5, 0.5, TILE - 1, TILE - 1)
  })

  // Flower: a few tiny coloured buds on a TRANSPARENT tile, so it overlays
  // whatever grass (procedural or admin tileset art) is painted beneath it.
  drawTile(scene, 'tile.flower', (g) => {
    g.fillStyle(PALETTE.flowerA, 1)
    g.fillRect(14, 16, 8, 8)
    g.fillStyle(PALETTE.flowerB, 1)
    g.fillRect(24, 22, 8, 8)
    g.fillStyle(PALETTE.flowerB, 1)
    g.fillRect(24, 26, 8, 8)
    g.fillStyle(PALETTE.flowerA, 1)
    g.fillRect(12, 30, 8, 8)
  })

  // Tall grass: grass base + a dark-green clump of "blades" in the lower
  // half. Approximates the CSS clip-path polygon in .t-tallgrass.
  drawTile(scene, 'tile.tallgrass', (g) => {
    g.fillStyle(PALETTE.grass, 1)
    g.fillRect(0, 0, TILE, TILE)
    g.fillStyle(PALETTE.tree, 1)
    // A simple bladey silhouette — 6 triangles + a base band.
    const baseY = 22
    g.fillRect(0, baseY + 14, TILE, TILE - (baseY + 14))
    const blades = [
      [0, 6], [8, 0], [16, 6], [22, -2], [30, 6], [38, 0], [46, 6],
    ]
    for (let i = 0; i < blades.length - 1; i++) {
      const [x1, dy1] = blades[i]
      const [x2, dy2] = blades[i + 1]
      g.fillTriangle(
        x1,
        baseY + 14,
        x2,
        baseY + 14,
        (x1 + x2) / 2,
        baseY + Math.min(dy1, dy2),
      )
    }
    g.fillStyle(PALETTE.treeDk, 1)
    g.fillRect(0, TILE - 7, TILE, 7)
  })

  // Tree: grass background + a rounded green canopy with a darker bottom band.
  drawTile(scene, 'tile.tree', (g) => {
    g.fillStyle(PALETTE.grass, 1)
    g.fillRect(0, 0, TILE, TILE)
    g.fillStyle(PALETTE.tree, 1)
    g.fillRoundedRect(2, 2, TILE - 4, TILE - 4, 12)
    g.lineStyle(2, PALETTE.treeDk, 1)
    g.strokeRoundedRect(2, 2, TILE - 4, TILE - 4, 12)
    g.fillStyle(PALETTE.treeDk, 1)
    g.fillRect(4, TILE - 12, TILE - 8, 8)
    // Inset highlight near the top — Pokémon-style canopy shading.
    g.fillStyle(0xffffff, 0.13)
    g.fillRect(4, 4, TILE - 8, 6)
  })

  // Signpost: grass background + a small dark post and a beige board on it.
  drawTile(scene, 'tile.sign', (g) => {
    g.fillStyle(PALETTE.grass, 1)
    g.fillRect(0, 0, TILE, TILE)
    g.fillStyle(PALETTE.door, 1)
    g.fillRect(22, 22, 5, 18)
    g.fillStyle(PALETTE.wall, 1)
    g.fillRect(9, 12, 30, 16)
    g.lineStyle(2, PALETTE.door, 1)
    g.strokeRect(10, 13, 28, 14)
  })
}

// ---- Interior textures (PR-C) ------------------------------------
// Mirrors the CSS look of <CommunityInterior>: warm wood floor, dark
// stone wall (with optional accent banner painted at runtime per
// community via a separate sprite), and a doormat labelled "EXIT".

const INTERIOR_PALETTE = {
  floor: 0xd6a86b,
  floorSeam: 0xa07237,
  wall: 0x6a5538,
  doormat: 0x8d6a3d,
  doormatFrame: 0x4a3a2a,
}

export function ensureInteriorTileTextures(scene) {
  if (scene.textures.exists('interior.floor')) return

  drawTile(scene, 'interior.floor', (g) => {
    g.fillStyle(INTERIOR_PALETTE.floor, 1)
    g.fillRect(0, 0, TILE, TILE)
    g.fillStyle(INTERIOR_PALETTE.floorSeam, 1)
    g.fillRect(0, TILE - 3, TILE, 3) // bottom plank seam
    g.fillStyle(0xffffff, 0.18)
    g.fillRect(0, 0, TILE, 1) // top highlight
    g.fillStyle(0x000000, 0.12)
    g.fillRect(0, 0, 2, TILE) // vertical plank seam (left)
  })

  drawTile(scene, 'interior.wall', (g) => {
    g.fillStyle(INTERIOR_PALETTE.wall, 1)
    g.fillRect(0, 0, TILE, TILE)
    g.fillStyle(0xffffff, 0.18)
    g.fillRect(0, 0, TILE, 4)
    g.fillStyle(0x000000, 0.3)
    g.fillRect(0, TILE - 4, TILE, 4)
    g.fillStyle(0x000000, 0.18)
    g.fillRect(0, 0, 4, TILE)
    g.fillStyle(0x000000, 0.18)
    g.fillRect(TILE - 4, 0, 4, TILE)
  })

  drawTile(scene, 'interior.doormat', (g) => {
    g.fillStyle(INTERIOR_PALETTE.doormat, 1)
    g.fillRect(0, 0, TILE, TILE)
    g.lineStyle(3, INTERIOR_PALETTE.doormatFrame, 1)
    g.strokeRect(1.5, 1.5, TILE - 3, TILE - 3)
    g.fillStyle(0xffffff, 0.18)
    g.fillRect(3, 3, TILE - 6, 6)
    g.fillStyle(0x000000, 0.28)
    g.fillRect(3, TILE - 9, TILE - 6, 6)
  })
}

// Helper: open a Graphics, run the painter, render to a texture, throw the
// Graphics away. The Graphics object isn't added to the scene — it lives
// just long enough to bake the texture into the GPU.
function drawTile(scene, key, paint) {
  const g = scene.add.graphics({ x: 0, y: 0 })
  g.setVisible(false)
  paint(g)
  g.generateTexture(key, TILE, TILE)
  g.destroy()
}
