// PR-A placeholder scene: just a coloured GB-tinted background, a tile grid
// to telegraph that a real map is coming, and a banner that says "PHASER
// PLACEHOLDER". It exists to prove the Phaser × React bridge works
// end-to-end before any real game logic moves over from the DOM engine.
//
// PR-B replaces this with the real TownScene.

import Phaser from 'phaser'

export default class PlaceholderScene extends Phaser.Scene {
  constructor() {
    super('Placeholder')
  }

  create() {
    const { width, height } = this.scale

    // Background — same warm beige as the GB screen so the placeholder
    // sits inside the existing chrome without screaming "different".
    this.cameras.main.setBackgroundColor(0xe8d99c)

    // Subtle 48 px grid so the engine's pixel-perfect tiling is visible.
    const g = this.add.graphics()
    g.lineStyle(1, 0x000000, 0.08)
    for (let x = 0; x <= width; x += 48) {
      g.lineBetween(x, 0, x, height)
    }
    for (let y = 0; y <= height; y += 48) {
      g.lineBetween(0, y, width, y)
    }

    // Centred banner.
    this.add
      .text(width / 2, height / 2 - 16, 'PHASER PLACEHOLDER', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#2c1d10',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    this.add
      .text(width / 2, height / 2 + 16, 'PR-A bootstrap — TownScene lands next', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#4a3a2a',
      })
      .setOrigin(0.5)

    // Expose a tiny read-only test API. Subsequent PRs will hang the
    // playerTile / opponent / buildings introspection off the same object,
    // so Playwright scripts have one place to read scene state from.
    if (typeof window !== 'undefined') {
      window.__game = {
        engine: 'phaser',
        activeSceneKey: () => this.scene.key,
      }
    }
  }
}
