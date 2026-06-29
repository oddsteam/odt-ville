import Phaser from 'phaser'
import { preloadBakedMap, renderBakedMap } from '../mapRenderer.ts'

// The authored-map scene — the runtime side of the map contract (ADR-0004).
// It renders "the current map" (read from the registry as a baked document)
// with no knowledge of which map it is: load the tilesets it names, blit the
// baked cells. Movement, zones, and presence arrive in later slices; this
// tracer proves a baked authored map renders through the shared draw path.
export default class MapScene extends Phaser.Scene {
  constructor() {
    super('Map')
  }

  preload() {
    preloadBakedMap(this)
  }

  create() {
    renderBakedMap(this)
  }
}
