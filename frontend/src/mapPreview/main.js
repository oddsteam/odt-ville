import Phaser from 'phaser'
import TiledMapScene from './TiledMapScene.js'
import { loadActiveManifest } from '../character/manifest.js'

// Boots the standalone Tiled-map preview (see map-preview.html). Kept
// separate from the React app so it loads the .tmx-derived map without any
// of the community/encounter game wiring.
//
// The player character comes from the active sprite manifest (localStorage if
// the sprite-mapper saved one, else the committed default). We resolve it
// before constructing the game and stash it in the registry; the scene reads
// it in preload(). Top-level await is fine — Vite serves this as an ES module.
const manifest = await loadActiveManifest()

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b1b22',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  scene: [TiledMapScene],
})

// Set synchronously after construction — Phaser defers boot, so this lands
// before the scene's preload() runs (same pattern as PhaserGame.jsx).
game.registry.set('characterManifest', manifest)
