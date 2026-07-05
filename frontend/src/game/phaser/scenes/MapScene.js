import Phaser from 'phaser'
import { preloadBakedMap, renderBakedMap } from '../mapRenderer.ts'
import { MOVE_MS } from '../../constants.js'
import { spawnTile, mapWalkable, entityBlockedFor, feetWorldXY } from '../mapWalk.ts'
import {
  CHAR_SHEET_KEY,
  preloadCharacter,
  buildCharacterRig,
  characterScale,
  applyFacing,
} from '../characterRig.js'
import { resolveDirection, stepTile } from '../movement.ts'
import downStill from '../../assets/character/rpg-char-01/r0-c0.png'
import leftStill from '../../assets/character/rpg-char-01/r1-c0.png'
import rightStill from '../../assets/character/rpg-char-01/r2-c0.png'
import upStill from '../../assets/character/rpg-char-01/r3-c0.png'

// Bundled still frame per direction — the no-manifest fallback. This game
// instance boots without TownScene, so the walk strips it loads aren't in the
// texture cache; stills are enough for the movement tracer.
const STILL_URLS = { down: downStill, left: leftStill, right: rightStill, up: upStill }

// The authored-map scene — the runtime side of the map contract (ADR-0004).
// It renders "the current map" (read from the registry as a baked document)
// with no knowledge of which map it is: load the tilesets it names, blit the
// baked cells, and walk the shared character rig over it. Walkability is the
// composed rule (mapWalk.mapWalkable): in bounds ∧ not in the painted collision
// mask (#131) ∧ not blocked by a placed entity's walk-mask; zones and presence
// arrive in later slices (#85).
export default class MapScene extends Phaser.Scene {
  constructor() {
    super('Map')
    this.player = null
    this.playerTile = { x: 0, y: 0 }
    this.facing = 'down'
    this.movingTween = null
  }

  preload() {
    preloadBakedMap(this)
    this._charManifest = preloadCharacter(this)
    for (const [dir, url] of Object.entries(STILL_URLS)) {
      this.load.image(`player.${dir}.0`, url)
    }
  }

  create() {
    renderBakedMap(this)
    const map = this._bakedMap
    if (!map) return

    const rig = buildCharacterRig(this, this._charManifest)
    this.usingManifest = rig.usingManifest
    this.charDir = rig.charDir

    this.playerTile = spawnTile(map)
    // Walkability = in bounds ∧ not in the collision mask ∧ not blocked by a
    // placed entity's walk-mask (#131). Legacy maps carry no `collision` and only
    // props (no walk_mask), so this reduces to the in-bounds tracer rule for them.
    this.walkable = mapWalkable(map, map.collision, entityBlockedFor(map.entities))
    const feet = feetWorldXY(this.playerTile, this.usingManifest)
    if (this.usingManifest) {
      const render = this._charManifest.render || { originX: 0.5, originY: 1, scale: 1 }
      this.player = this.add
        .sprite(feet.x, feet.y, CHAR_SHEET_KEY, this.charDir.down.idleFrame)
        .setOrigin(render.originX, render.originY)
      this.player.setScale(characterScale(this._charManifest))
      applyFacing(this.player, this.charDir, this.facing, false)
    } else {
      this.player = this.add
        .image(feet.x, feet.y, `player.${this.facing}.0`)
        .setOrigin(0.5, 1)
        // Same display size as TownScene (rpg-char-01 padding compensation).
        .setDisplaySize(96, 96)
    }
    // Above every baked ground layer and entity (ground stacks carry small
    // producer depths, entities sit at 1).
    this.player.setDepth(1000)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    })

    this.cameras.main.startFollow(this.player, true)

    // Test API — same shape the town/interior scenes publish, so the walking
    // e2e scripts can read state off the canvas.
    if (typeof window !== 'undefined') {
      window.__game = {
        engine: 'phaser',
        activeSceneKey: () => this.scene.key,
        playerTile: () => ({ ...this.playerTile }),
        mapSize: () => ({ cols: map.cols, rows: map.rows }),
      }
    }
  }

  update() {
    if (!this.player || this.movingTween) return
    const dir = this.activeDirection()
    if (dir) this.step(dir)
  }

  activeDirection() {
    return resolveDirection({ dpadDir: null, cursors: this.cursors, wasd: this.wasd })
  }

  step(dir) {
    this.facing = dir
    const result = stepTile({
      scene: this,
      target: this.player,
      from: this.playerTile,
      dir,
      walkable: this.walkable,
      toWorldXY: (t) => feetWorldXY(t, this.usingManifest),
      duration: MOVE_MS,
      onStart: (t) => {
        this.playerTile = t
        if (this.usingManifest) applyFacing(this.player, this.charDir, dir, true)
        else this.player.setTexture(`player.${dir}.0`)
      },
      onBlocked: () => {
        if (this.usingManifest) applyFacing(this.player, this.charDir, dir, false)
        else this.player.setTexture(`player.${dir}.0`)
      },
      onArrive: () => {
        this.movingTween = null
        if (this.usingManifest && !this.activeDirection()) {
          applyFacing(this.player, this.charDir, this.facing, false)
        }
      },
    })
    this.movingTween = result.tween
  }
}
