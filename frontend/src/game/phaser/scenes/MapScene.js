import Phaser from 'phaser'
import { preloadBakedMap, renderBakedMap } from '../../../kernel/mapRenderer.ts'
import { MOVE_MS } from '../../constants.js'
import { spawnTile, mapWalkable, entityBlockedFor, entityEdgeBlockedFor, entityDoorCells, entityLadderFor, entityOverhangFor, entityForegroundFor, mapPlayerDepth, feetWorldXY } from '../mapWalk.ts'
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
    // A placed building's door cell (#29, #212) is its walkable entrance: it
    // overrides the entity's own walk-mask so a solid footprint is still
    // enterable, mirroring town.ts's always-walkable door. Legacy/door-less maps
    // yield no door cells, so this leaves walk-mask collision untouched.
    this.doorCell = entityDoorCells(map.entities)
    const entityBlocked = entityBlockedFor(map.entities)
    // Walkability = in bounds ∧ not in the collision mask ∧ not blocked by a
    // placed entity's walk-mask (#131), except the door cell is always walkable.
    // Legacy maps carry no `collision` and only props (no walk_mask), so this
    // reduces to the in-bounds tracer rule for them.
    this.walkable = mapWalkable(map, map.collision, (x, y) => entityBlocked(x, y) && !this.doorCell(x, y))
    // Fence-style border collision (#207): a placed entity's edge_mask blocks the
    // border *between* two otherwise-walkable cells (not the cell itself), so it
    // rides stepTile's transition-aware veto rather than `walkable`. Legacy maps
    // carry no edge masks, so this reduces to "never blocked".
    this.edgeBlocked = entityEdgeBlockedFor(map.entities)
    // Ladder posture (#54, #211): a placed object's walk-mask 'L' cell is
    // walkable like a porch but swaps the walk loop for the climb posture while
    // the avatar moves over it, mirroring town.ts's isLadderCell. Characters
    // with no authored climb frames fall back to walk (handled in the rig).
    // Legacy maps carry no 'L' cells, so this reduces to "never a ladder".
    this.isLadder = entityLadderFor(map.entities)
    // Overhang depth (#44, #210): a placed object's walk-mask 'o' cell is walkable
    // like a porch, but the object's art must draw *over* the avatar (walk-under),
    // so while the avatar stands there its depth drops below the entity band —
    // the authored-map companion to town.ts playerDepthAt's overhang branch.
    // Legacy maps carry no 'o' cells, so this reduces to "never an overhang".
    this.isOverhang = entityOverhangFor(map.entities)
    // Foreground overlay occlusion (#36, #168): a placed object carrying an
    // fg_mask stamps a masked copy of its art over the avatar's band (see
    // mapRenderer). While the avatar stands on that object's footprint its depth
    // drops between the base art and the overlay so the masked canopy covers it,
    // but its default depth beats the overlay once south of the footprint. The
    // mask + footprint live on the object, so this reads the resolved objects.
    // Legacy/mask-less maps yield no foreground cells — a no-op here.
    const objectsById = new Map((this._bakedObjects || []).map((o) => [o.id, o]))
    this.isForeground = entityForegroundFor(map.entities, objectsById)
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
    // Above every baked ground layer and entity by default (ground stacks carry
    // small producer depths, entities sit at MAP_ENTITY_DEPTH), except an
    // overhang cell drops the avatar below the entity band so the object's art
    // draws over it (walk-under, #210).
    this.player.setDepth(
      mapPlayerDepth(
        this.isOverhang(this.playerTile.x, this.playerTile.y),
        this.isForeground(this.playerTile.x, this.playerTile.y),
      ),
    )

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
      transitionBlocked: (from, to) => this.edgeBlocked(from.x, from.y, to.x, to.y),
      toWorldXY: (t) => feetWorldXY(t, this.usingManifest),
      duration: MOVE_MS,
      onStart: (t) => {
        this.playerTile = t
        // Drop below the entity band from the start of the step onto an overhang
        // cell so the object's art overhangs the avatar the whole slide (#210),
        // or between the base art and the fg overlay onto a foreground cell so the
        // masked canopy covers the avatar (#168), mirroring TownScene's per-step
        // playerDepthAt.
        this.player.setDepth(mapPlayerDepth(this.isOverhang(t.x, t.y), this.isForeground(t.x, t.y)))
        // Climb while stepping onto a placed object's ladder cell (#211); the
        // rig falls back to walk when the character authors no climb frames.
        if (this.usingManifest) applyFacing(this.player, this.charDir, dir, true, this.isLadder(t.x, t.y))
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
