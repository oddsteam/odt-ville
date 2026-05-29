import Phaser from 'phaser'
import { TILE, MOVE_MS, PLAYER_FEET_LIFT, buildTown, tileChar } from '../../constants.js'
import { ensureTileTextures } from '../tileTextures.js'
import bus from '../bus.js'
import {
  GATE_TRAINER,
  resolveTrainerStart,
  trainerSightCells,
  rollEncounter,
  pickWildPokemon,
  GRACE_STEPS,
} from '../../encounters.js'

// Tile classes that block movement. Mirrors `isGroundWalkable` in
// constants.js: anything not in this set is walkable ground; tree/sign are
// not walkable, doors are special-cased below.
const BLOCKED_TILE_CHARS = new Set(['T', 's'])

// Asset URLs are imported by PhaserGame and pushed into the registry so a
// scene doesn't need to know module paths. The registry shape:
//   {
//     spritesheets: { player: { url, frames } },
//     buildings:    { roofUrl, bodyUrl },
//     communities:  Community[],
//     session:      { spawn: { last_community_id } },
//   }

export default class TownScene extends Phaser.Scene {
  constructor() {
    super('Town')
    // Mutable per-scene state, all stored on `this` so the test API can read
    // it without needing to climb the Phaser internals.
    this.player = null
    this.playerTile = { x: 0, y: 0 }
    this.facing = 'up'
    this.movingTween = null
    this.town = null
    this.buildings = [] // [{ community, col, row, w, h, doorCol, doorRow, sprite }]
    this.heldDirs = []
    // When InteriorScene exits via the doormat it scene.starts us with
    // `{ exitedCommunityId }`; we honor that over session-based spawn so
    // the player lands on the community they just left, not whatever the
    // session last persisted.
    this.exitedCommunityId = null
    // Gate-trainer state. The trainer is a single sprite at a tile near
    // the entrance, with a `sightCells` line in front of him; stepping
    // into any of those cells fires a trainer encounter. After the
    // player runs away once, `defeated` flips on and the markers hide.
    this.trainer = null // { x, y, facing, sightRange }
    this.trainerSprite = null
    this.sightCells = []
    this.sightGraphics = null // pulsing red markers
    // Wild-encounter rate limiting — N grace steps after each encounter
    // before another can fire, so leaving the grass is reliable.
    this.graceSteps = 0
  }

  init(data) {
    this.exitedCommunityId = data?.exitedCommunityId ?? null
    // Reset per-scene-start runtime state. The constructor only runs once
    // for the whole game lifetime; without this, a movingTween that was
    // in flight at the moment we scene.start('Interior') gets destroyed
    // by Phaser but the reference here stays non-null — and update()'s
    // `if (this.movingTween) return` guard would freeze the player on
    // the next return to Town.
    this.movingTween = null
    this.dpadDir = null
    this.graceSteps = 0
  }

  preload() {
    const reg = this.registry.get('assets') || {}

    // Player walks: 4-frame strip per direction. The DOM engine loads each
    // PNG separately; here we keep them as individual textures and look up
    // by direction + step index.
    const player = reg.player || {}
    for (const dir of ['up', 'down', 'left', 'right']) {
      const frames = player[dir] || []
      frames.forEach((url, i) => {
        this.load.image(`player.${dir}.${i}`, url)
      })
    }

    if (reg.buildings) {
      this.load.image('building.roof', reg.buildings.roofUrl)
      this.load.image('building.body', reg.buildings.bodyUrl)
    }

    // Gate trainer + opponent sprites. `encounters.js` already imports
    // these as Vite-resolved URLs; we just reuse them so the engines
    // share one source of truth for the opponent table.
    this.load.image('trainer.boss-k', GATE_TRAINER.sprite)
  }

  create() {
    ensureTileTextures(this)

    const communities = this.registry.get('communities') || []
    const session = this.registry.get('session') || null

    // Town geometry is identical to the DOM engine's — we keep a single
    // source of truth in constants.js so PR-B doesn't drift from the
    // game's design data.
    this.town = buildTown(Math.max(communities.length, 1))

    // With Scale.RESIZE in PhaserGame, the canvas display size matches
    // .gb-screen at 1:1 device pixels (TILE=48 → 48 screen px, same as
    // DOM). We do NOT call scale.resize here: that would re-size the
    // canvas to the world size and the player would see everything at
    // once. The camera's setBounds caps scroll to the world's edges.
    const worldW = this.town.cols * TILE
    const worldH = this.town.rows * TILE
    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.physics?.world.setBounds(0, 0, worldW, worldH)

    // Ground layer — one image per tile. This is more sprites than a
    // tilemap-backed approach, but tile count tops out around 24×19 today
    // and Phaser batches identical-texture sprites efficiently.
    for (let y = 0; y < this.town.rows; y++) {
      for (let x = 0; x < this.town.cols; x++) {
        const ch = this.town.map[y][x]
        const key = keyForTileChar(ch)
        if (key) this.add.image(x * TILE, y * TILE, key).setOrigin(0, 0).setDepth(0)
      }
    }

    // Buildings — placement sorted by position_order, dropped onto the
    // town's plots in turn. Same shape as buildBuildings() in VillageGame.
    const sorted = [...communities].sort((a, b) => a.position_order - b.position_order)
    this.buildings = sorted.map((community, i) => {
      const plot = this.town.plots[i]
      const sprite = this.addBuildingSprite(community, plot)
      return { community, ...plot, sprite }
    })

    // Player sprite + spawn. Falls back to the entrance if the session is
    // empty or names a community that no longer exists.
    this.spawnPlayer(session)

    // Gate trainer (PR-D) — derived from the town's entrance via
    // resolveTrainerStart() so position follows the entrance even when
    // the town reshapes. Defeated state is read from the registry.
    this.addGateTrainer()

    // Keyboard input — Phaser's cursor keys + WASD via additional keys.
    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    })
    // Overlay D-pad — React emits press/release events on the bus so
    // we drive movement from tap/click input the same way keyboard
    // input feeds activeDirection().
    this.dpadDir = null
    this._onDpadPress = (d) => {
      this.dpadDir = d
    }
    this._onDpadRelease = (d) => {
      if (this.dpadDir === d) this.dpadDir = null
    }
    bus.on('dpadPress', this._onDpadPress)
    bus.on('dpadRelease', this._onDpadRelease)

    // Test API. PR-A only exposed `engine`; PR-B+ hang reads off the
    // same object so Playwright can introspect scene state without
    // poking around Phaser internals.
    if (typeof window !== 'undefined') {
      window.__game = {
        engine: 'phaser',
        activeSceneKey: () => this.scene.key,
        playerTile: () => ({ ...this.playerTile }),
        buildings: () =>
          this.buildings.map((b) => ({
            id: b.community.id,
            title: b.community.title,
            color: b.community.color,
            x: b.col * TILE,
            y: b.row * TILE,
          })),
        trainer: () => ({
          x: this.trainer?.x ?? null,
          y: this.trainer?.y ?? null,
          defeated: Boolean(this.registry.get('trainerDefeated')),
          sightCells: this.sightCells.map((c) => ({ x: c.x, y: c.y })),
        }),
      }
    }

    // React → Phaser registry watchers. The rule for what the scene
    // subscribes to: **structural data is a scene-boot input, not a
    // live data source.** The community list (positions, titles,
    // colours) and the session are read once by spawnPlayer +
    // addBuildingSprite during create() and never re-read mid-scene.
    // The shell still pushes fresh communities/session into the
    // registry on every loadTown() refresh, but the scene ignores
    // those events — the new shape takes effect the next time
    // VillageGame mounts (tab switch ⚙ ADMIN → 🕹️ VILLAGE, or a
    // page reload). That keeps the player in place during normal
    // play and removes the surprise-restart bug class entirely.
    //
    // Only **presentation-level** registry keys are listened to
    // here. trainerDefeated is presentation (sprite tint + sight
    // markers); when live notification badges arrive they'll get
    // their own dedicated key + handler with the same in-place
    // update discipline.
    this.registry.events.on('changedata-trainerDefeated', this.refreshTrainerVisuals, this)

    // When EncounterScene closes it scene.resume()s us; this is the
    // hook to re-arm grace steps after a wild run.
    this.events.on(Phaser.Scenes.Events.RESUME, this.handleResume, this)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata-trainerDefeated', this.refreshTrainerVisuals, this)
      this.events.off(Phaser.Scenes.Events.RESUME, this.handleResume, this)
      bus.off('dpadPress', this._onDpadPress)
      bus.off('dpadRelease', this._onDpadRelease)
      if (typeof window !== 'undefined' && window.__game?.engine === 'phaser') {
        delete window.__game
      }
    })
  }

  update() {
    if (this.movingTween) return // already animating to next tile
    const dir = this.activeDirection()
    if (dir) this.step(dir)
  }

  // ---- helpers ------------------------------------------------------

  // Resolve which direction key is currently held; the most-recently
  // pressed direction wins so changing direction mid-walk feels snappy.
  // Overlay D-pad press wins over keyboard since taps are usually
  // mutually exclusive with held keys on the same device.
  activeDirection() {
    if (this.dpadDir) return this.dpadDir
    const c = this.cursors
    const w = this.wasd
    if (c.up.isDown || w.up.isDown) return 'up'
    if (c.down.isDown || w.down.isDown) return 'down'
    if (c.left.isDown || w.left.isDown) return 'left'
    if (c.right.isDown || w.right.isDown) return 'right'
    return null
  }

  // One tile step. Mirrors `step(dir)` in VillageMap exactly so the
  // player's behavior is unchanged between engines.
  step(dir) {
    this.facing = dir
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
    const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
    const tx = this.playerTile.x + dx
    const ty = this.playerTile.y + dy

    // Door collision — stepping onto a doorway emits enterCommunity for
    // the React shell (session save) and transitions Phaser to the
    // interior scene with the community payload attached.
    const door = this.buildings.find((b) => b.doorCol === tx && b.doorRow === ty)
    if (door) {
      bus.emit('enterCommunity', door.community.id)
      this.scene.start('Interior', { community: door.community })
      return
    }

    if (!this.walkable(tx, ty)) {
      // Bumped a wall — face the direction in still pose; no tween.
      this.player.setTexture(`player.${this.facing}.0`)
      return
    }

    this.playerTile = { x: tx, y: ty }
    // Depth tracks the player's current row so south-of-player buildings
    // (higher row → higher depth) draw on top and north-of-player
    // buildings (lower row → lower depth) draw behind — same y-sort
    // discipline the buildings themselves use. Without this update the
    // depth set at spawn would never change and the player would slip
    // behind any building that happens to be south of its spawn row.
    this.player.setDepth(ty * 10 + 5)
    // rpg-char-01 has 3 frames per direction: 0 still, 1 step-A, 2 step-B.
    // Alternate walk-A and walk-B with each step so the gait reads as
    // left-foot / right-foot — same scheme as InteriorScene.
    this.player.setTexture(
      `player.${this.facing}.${(this.player.stepCount++ % 2) + 1}`,
    )
    this.movingTween = this.tweens.add({
      targets: this.player,
      x: tx * TILE + TILE / 2,
      // Feet land at the destination tile's floor (matches setOrigin),
      // offset by PLAYER_FEET_LIFT to account for the sprite's foot
      // position inside its display box (+y = down in Phaser).
      y: (ty + 1) * TILE + PLAYER_FEET_LIFT,
      duration: MOVE_MS,
      onComplete: () => {
        this.movingTween = null
        // Snap back to still at the end of the slide so a single tap
        // doesn't leave the sprite stuck mid-stride. If the player is
        // still holding a direction, update() will immediately call
        // step() again and the next walk frame takes over.
        this.player.setTexture(`player.${this.facing}.0`)
        // Trainer sight is checked first — when the player lands in
        // his line of sight, the duel takes priority over a wild
        // encounter on the same step.
        if (!this.maybeTrainerSpot(tx, ty)) {
          this.maybeWildEncounter(tx, ty)
        }
      },
    })
  }

  // Trainer line-of-sight check. Returns true if a duel was triggered
  // so the caller can skip the wild-grass roll on the same step.
  maybeTrainerSpot(x, y) {
    if (!this.trainer) return false
    if (this.registry.get('trainerDefeated')) return false
    const inSight = this.sightCells.some((c) => c.x === x && c.y === y)
    if (!inSight) return false
    this.launchEncounter({ ...GATE_TRAINER })
    return true
  }

  // Wild-encounter roll — only fires on a tall-grass tile, only when
  // not in the GRACE_STEPS window after the last encounter.
  maybeWildEncounter(x, y) {
    if (tileChar(this.town, x, y) !== 'g') return
    if (this.graceSteps > 0) {
      this.graceSteps -= 1
      return
    }
    if (rollEncounter()) {
      this.launchEncounter(pickWildPokemon())
    }
  }

  launchEncounter(opponent) {
    // Pause this scene so its update() loop (and the world) freeze
    // while the duel runs; EncounterScene resumes us on close.
    this.scene.pause()
    this.scene.launch('Encounter', { opponent })
  }

  handleResume(_sys, data) {
    // EncounterScene exited. Wild → arm grace steps. Trainer →
    // trainerDefeated already flipped via the bus; refresh visuals.
    if (data?.ranFrom === 'wild') this.graceSteps = GRACE_STEPS
    this.refreshTrainerVisuals()
  }

  // Walkability check — ground class + building footprint exclusion.
  // Doors are walkable: they're how the player enters. The gate trainer
  // also occupies a tile and blocks pass-through (defeated trainers
  // still stand there in Pokémon, you walk around).
  walkable(x, y) {
    const ch = tileChar(this.town, x, y)
    if (BLOCKED_TILE_CHARS.has(ch)) return false
    if (this.buildings.some((b) => b.doorCol === x && b.doorRow === y)) return true
    if (
      this.buildings.some(
        (b) => x >= b.col && x < b.col + b.w && y >= b.row && y < b.row + b.h,
      )
    ) {
      return false
    }
    if (this.trainer && this.trainer.x === x && this.trainer.y === y) return false
    return true
  }

  // Place the gate trainer + render his line-of-sight markers. Called
  // once on scene boot, after the buildings + player are positioned so
  // depth-sorting comes out right.
  addGateTrainer() {
    const start = resolveTrainerStart(this.town)
    this.trainer = start
    this.sightCells = trainerSightCells(start, this.town)

    // The trainer sprite is portrait-aspect (taller than wide); same
    // trick the buildings use — overflow the tile upward, ground the
    // figure at the bottom of his tile so his shoes line up with the
    // road. Two-sprite drop shadow approximated by a translucent dark
    // ellipse below.
    const tx = start.x * TILE
    const ty = start.y * TILE
    const targetH = 96
    const sprite = this.add
      .image(tx + TILE / 2, ty + TILE, 'trainer.boss-k')
      .setOrigin(0.5, 1)
      .setDepth(start.y * 10 + 4)
    const scale = targetH / sprite.height
    sprite.setScale(scale)
    this.trainerSprite = sprite

    // Sight markers — soft red pulsing squares on each sight cell.
    // Drawn as a single Graphics with one rect per cell so a single
    // tween animates them all in sync. Hidden when defeated.
    const g = this.add.graphics().setDepth(1)
    for (const c of this.sightCells) {
      g.fillStyle(0xff5050, 0.32)
      g.fillCircle(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2, TILE * 0.45)
    }
    this.tweens.add({
      targets: g,
      alpha: { from: 0.55, to: 0.95 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.sightGraphics = g

    this.refreshTrainerVisuals()
  }

  // Trainer visuals — fade sprite + hide markers when defeated, normal
  // colors otherwise. Called whenever trainerDefeated flips, and after
  // every EncounterScene exit (the trainer is the most recent thing
  // that might have changed).
  refreshTrainerVisuals() {
    const defeated = Boolean(this.registry.get('trainerDefeated'))
    if (this.trainerSprite) {
      // Darken a hair + desaturate so he reads as "guarding, but
      // already faced". Matches the DOM .trainer-defeated filter look.
      if (defeated) {
        this.trainerSprite.setTint(0x999999)
      } else {
        this.trainerSprite.clearTint()
      }
      this.trainerSprite.setAlpha(defeated ? 0.75 : 1)
    }
    if (this.sightGraphics) {
      this.sightGraphics.setVisible(!defeated)
    }
  }

  // Set the sprite to the still pose for the current facing. Used
  // after spawn / session changes; the per-step walk animation is
  // handled inline in step() (frame alternation + onComplete snap
  // back to this still pose).
  updatePlayerFrame() {
    this.player.setTexture(`player.${this.facing}.0`)
  }

  // Build the two-layer building sprite. We don't yet hue-rotate from
  // the community color — Phaser tint is RGB-only and a per-roof
  // hue-rotate would need a custom shader. PR-B accepts a uniform roof
  // color for now; PR-C+ adds the shader / palette-swap.
  addBuildingSprite(community, plot) {
    const cx = plot.col * TILE
    const cy = plot.row * TILE
    const w = plot.w * TILE
    const h = plot.h * TILE

    // Roof — top 36% of the footprint.
    const roof = this.add
      .image(cx, cy, 'building.roof')
      .setOrigin(0, 0)
      .setDisplaySize(w, h * 0.36)
      .setDepth((plot.row + plot.h) * 10 - 1)

    // Body — bottom 64%.
    this.add
      .image(cx, cy + h * 0.36, 'building.body')
      .setOrigin(0, 0)
      .setDisplaySize(w, h * 0.64)
      .setDepth((plot.row + plot.h) * 10 - 1)

    // Nameplate under the building — small text, dark on light.
    this.add
      .text(cx + w / 2, cy + h - 4, community.title.toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#2c1d10',
        backgroundColor: '#f3e6bb',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 0)
      .setDepth((plot.row + plot.h) * 10 + 1)

    // Approximate per-community tint by tinting the roof — until we have
    // a hue-rotate shader, this is the cheapest way to differentiate
    // houses visually.
    if (community.color) {
      const hex = parseInt(community.color.replace('#', ''), 16)
      if (!Number.isNaN(hex)) roof.setTint(hex)
    }

    return roof
  }

  spawnPlayer(session) {
    // Spawn priority:
    //   1. The community we just exited (passed via scene.start data).
    //   2. The session's `last_community_id` (returning visitor on reload).
    //   3. The Town Entrance (first-time / cleared session).
    const id =
      this.exitedCommunityId ?? session?.spawn?.last_community_id ?? null
    const b = id != null ? this.buildings.find((x) => x.community.id === id) : null
    const spawn = b
      ? { x: b.doorCol, y: b.doorRow + 1, facing: 'up' }
      : { x: this.town.entrance.x, y: this.town.entrance.y, facing: 'up' }

    this.playerTile = { x: spawn.x, y: spawn.y }
    this.facing = spawn.facing
    this.player = this.add
      .image(
        spawn.x * TILE + TILE / 2,
        // Feet anchor at the tile floor — same as the trainer sprite,
        // so when they stand side by side their feet line up. Offset
        // by PLAYER_FEET_LIFT so the rpg-char-01 sprite's visible feet
        // (which sit inside its 96×96 display box's padding) land
        // where the eye expects them on the tile (+y = down in Phaser).
        (spawn.y + 1) * TILE + PLAYER_FEET_LIFT,
        `player.${spawn.facing}.0`,
      )
      .setOrigin(0.5, 1)
      .setDepth(spawn.y * 10 + 5)
      // rpg-char-01 has heavy transparent padding inside its 32×32
      // box, so 96×96 brings the visible body to a Pokémon-faithful
      // on-screen height. Source PNG is square; display kept square.
      .setDisplaySize(96, 96)
    this.player.stepCount = 0
    this.updatePlayerFrame()
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15)
  }

}

// Map a tile character to a texture key. Anything boundary-tree-ish (T)
// or unspecified renders as a tree; ground tiles use their dedicated
// textures so the scene matches the DOM engine's look as closely as
// procedural shapes can manage.
function keyForTileChar(ch) {
  switch (ch) {
    case '.':
      return 'tile.grass'
    case ':':
      return 'tile.path'
    case '*':
      return 'tile.flower'
    case 'g':
      return 'tile.tallgrass'
    case 'T':
      return 'tile.tree'
    case 's':
      return 'tile.sign'
    default:
      return null
  }
}
