import Phaser from 'phaser'
import { TILE, MOVE_MS, PLAYER_FEET_LIFT, buildTown, tileChar } from '../../constants.js'
import { ensureTileTextures } from '../tileTextures.js'
import {
  ENABLED as TILESET_ENABLED,
  PROPS,
  tallPropsFor,
} from '../townTileset.js'
import { buildingKeyFor, DEFAULT_BUILDING } from '../../buildings.js'
import {
  CHAR_SHEET_KEY,
  preloadCharacter,
  buildCharacterRig,
  characterScale,
  applyFacing,
} from '../characterRig.js'
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

// Dev-only layer inspector (press L for a panel, number keys to toggle each
// layer; also window.__game.layers in the console). import.meta.env.DEV is
// statically false in production builds, so Vite strips all of this. The first
// five are flat ground bands (one depth each); the last three are depth-sorted
// sprite groups (trees/buildings/trainer aren't a single layer, but toggling
// their visibility works the same regardless of depth).
const DEV = import.meta.env.DEV
const DEV_LAYERS = [
  { key: 'roadBase', label: 'Road base' },
  { key: 'dirtBase', label: 'Dirt base' },
  { key: 'grassFill', label: 'Grass fill' },
  { key: 'grassEdge', label: 'Grass edges' },
  { key: 'grassCorner', label: 'Grass corners' },
  { key: 'trees', label: 'Trees / props' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'npc', label: 'NPCs (trainer)' },
]
// Phaser keyboard event names for the digit keys 1..8.
const DEV_NUM_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT']

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
    // Manifest-driven character (sprite-mapper). When a manifest + its sheet
    // are present the player is an animated Sprite; otherwise we fall back to
    // the bundled rpg-char-01 frames. charDir holds the per-direction
    // { animKey, idleFrame, flips } lookup built in setupCharacter().
    this._charManifest = null
    this.usingManifest = false
    this.charDir = null
    this.movingTween = null
    this.town = null
    this.buildings = [] // [{ community, col, row, w, h, doorCol, doorRow, sprite }]
    this.propCells = new Set() // "x,y" tiles blocked by tall props (atlas mode)
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

    // Active character manifest (sprite-mapper). When present, its sheet drives
    // the player; the bundled frames above remain the fallback. The rig (frame
    // slicing + walk anims) is built in create() via setupCharacter().
    this._charManifest = preloadCharacter(this)

    // reg.buildings is a map of key → { roofUrl, bodyUrl }. Load every one
    // as `building.<key>.roof` / `.body`; addBuildingSprite picks per plot.
    for (const [key, art] of Object.entries(reg.buildings || {})) {
      if (art.roofUrl) this.load.image(`building.${key}.roof`, art.roofUrl)
      if (art.bodyUrl) this.load.image(`building.${key}.body`, art.bodyUrl)
    }

    // Gate trainer + opponent sprites. `encounters.js` already imports
    // these as Vite-resolved URLs; we just reuse them so the engines
    // share one source of truth for the opponent table.
    this.load.image('trainer.boss-k', GATE_TRAINER.sprite)

    // Tall-prop art for the overlay pass. An admin-defined tree object
    // (tile-object mapper → registry) wins; otherwise the bundled tree art
    // from townTileset.js is used.
    this._treeObject = this.registry.get('treeObject') || null
    if (this._treeObject?.image) {
      this.load.image('prop.tree', this._treeObject.image)
    } else if (TILESET_ENABLED) {
      for (const prop of Object.values(PROPS)) this.load.image(prop.key, prop.url)
    }

    // Ground-tile catalog (ground-tile mapper). Each referenced tileset loads
    // once as a uniform spritesheet (frame = cell), so create() can stamp a
    // specific cell — grass/dirt/road — onto the map by frame index.
    this._groundTiles = this.registry.get('groundTiles') || []
    const seenSheets = new Set()
    for (const t of this._groundTiles) {
      const key = `gtset.${t.tileset}`
      if (seenSheets.has(key)) continue
      seenSheets.add(key)
      this.load.spritesheet(key, `/maps/tilesets/${t.tileset}.png`, {
        frameWidth: t.cell,
        frameHeight: t.cell,
      })
    }
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

    // Ground is rendered in stacked depth layers so the grass edge tiles (which
    // are transparent on their outward side) reveal the terrain they border:
    //   depth 0    road base — under road cells + a 1-tile halo into the grass
    //   depth 0.1  dirt base — under the dirt field + a 1-tile halo into grass
    //   depth 0.2  surface   — grass (fill or edge tiles); road/dirt cells draw
    //                          nothing on top, so they stay full-strength and
    //                          narrow roads are never overdrawn by grass.
    // Fill + edge cells come from the ground-tile mapper; unknowns (the sign)
    // fall back to the procedural textures.
    // Dev layer inspector — bucket each ground sprite so it can be toggled
    // (see setupDevLayers, called after the test API is up). Stripped in prod.
    if (DEV) {
      this.devLayers = {}
      this.layerVisible = {}
      for (const l of DEV_LAYERS) {
        this.devLayers[l.key] = []
        this.layerVisible[l.key] = true
      }
    }

    this.groundTiles = this.buildGroundTileMap()
    this.paintGround()

    // Tall props (trees) — bottom-anchored sprites that overflow their tile
    // and y-sort against the player. Runs if either the bundled art or an
    // admin tree object is available.
    if (TILESET_ENABLED || this._treeObject?.image) this.addTallProps()

    // Tile-grid overlay (debug/authoring aid) — toggle with G. Drawn above
    // everything so tile boundaries are visible over ground, buildings, and
    // props. Hidden by default.
    const grid = this.add.graphics().setDepth(9000)
    grid.lineStyle(1, 0xffffff, 0.22)
    for (let x = 0; x <= this.town.cols; x++) grid.lineBetween(x * TILE, 0, x * TILE, worldH)
    for (let y = 0; y <= this.town.rows; y++) grid.lineBetween(0, y * TILE, worldW, y * TILE)
    grid.setVisible(false)
    this.gridGfx = grid
    this.showGrid = false

    // Buildings — placement sorted by position_order, dropped onto the
    // town's plots in turn. Same shape as buildBuildings() in VillageGame.
    const sorted = [...communities].sort((a, b) => a.position_order - b.position_order)
    this.buildings = sorted.map((community, i) => {
      const plot = this.town.plots[i]
      const sprite = this.addBuildingSprite(community, plot, i)
      return { community, ...plot, sprite }
    })

    // Slice the manifest sheet into frames + walk anims (no-op when there's no
    // manifest, leaving usingManifest false → bundled-frame player).
    this.setupCharacter()

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
    // G toggles the tile-grid overlay (authoring aid).
    this.input.keyboard.on('keydown-G', () => {
      this.showGrid = !this.showGrid
      this.gridGfx.setVisible(this.showGrid)
      // Coordinate labels (A1 notation) are built lazily on first reveal so
      // they cost nothing until the grid is used. Combined with a layer name
      // (the L panel), "grassEdge D5" names one tile on one layer in text.
      if (this.showGrid && !this.gridLabels) this.buildGridLabels()
      this.gridLabels?.setVisible(this.showGrid)
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

    // Dev-only ground-layer inspector (after the test API so it can hang off
    // window.__game). Stripped from production builds.
    if (DEV) this.setupDevLayers()

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
      this.setPlayerWalking(false)
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
    this.setPlayerWalking(true)
    this.movingTween = this.tweens.add({
      targets: this.player,
      x: tx * TILE + TILE / 2,
      // Feet land at the destination tile's floor (matches setOrigin). The
      // bundled rpg-char-01 needs PLAYER_FEET_LIFT for its padded box; the
      // manifest sprite is tightly cropped, so its feet sit on the floor.
      y: (ty + 1) * TILE + (this.usingManifest ? 0 : PLAYER_FEET_LIFT),
      duration: MOVE_MS,
      onComplete: () => {
        this.movingTween = null
        // Snap back to still at the end of the slide so a single tap doesn't
        // leave the sprite stuck mid-stride. With a held direction update()
        // re-steps immediately; the manifest path keeps its walk loop running
        // (only idling when no direction is held) to avoid a per-tile stutter.
        if (this.usingManifest) {
          if (!this.activeDirection()) this.applyFacing(this.facing, false)
        } else {
          this.player.setTexture(`player.${this.facing}.0`)
        }
        // Trainer sight is checked first — when the player lands in
        // his line of sight, the duel takes priority over a wild
        // encounter on the same step.
        if (!this.maybeTrainerSpot(tx, ty)) {
          this.maybeWildEncounter(tx, ty)
        }
      },
    })
  }

  // Set the player's frame for walking vs standing in the current facing.
  // Manifest sprites play/stop their walk anim; the bundled player alternates
  // its two walk frames (0 = still, 1/2 = step A/B), same as InteriorScene.
  setPlayerWalking(walking) {
    if (this.usingManifest) {
      this.applyFacing(this.facing, walking)
    } else if (walking) {
      this.player.setTexture(
        `player.${this.facing}.${(this.player.stepCount++ % 2) + 1}`,
      )
    } else {
      this.player.setTexture(`player.${this.facing}.0`)
    }
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
    if (this.propCells.has(`${x},${y}`)) return false
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
    if (DEV) this.devLayers?.npc?.push(sprite)

    // Sight markers — soft red pulsing squares on each sight cell.
    // Drawn as a single Graphics with one rect per cell so a single
    // tween animates them all in sync. Hidden when defeated.
    const g = this.add.graphics().setDepth(1)
    for (const c of this.sightCells) {
      g.fillStyle(0xff5050, 0.32)
      g.fillCircle(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2, TILE * 0.45)
    }
    if (DEV) this.devLayers?.npc?.push(g)
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
    if (this.usingManifest) this.applyFacing(this.facing, false)
    else this.player.setTexture(`player.${this.facing}.0`)
  }

  // Build the manifest character rig (shared with InteriorScene). No-op effect
  // when there's no manifest: usingManifest stays false and the bundled
  // rpg-char-01 player is used instead.
  setupCharacter() {
    const rig = buildCharacterRig(this, this._charManifest)
    this.usingManifest = rig.usingManifest
    this.charDir = rig.charDir
  }

  applyFacing(dir, walking) {
    if (this.usingManifest) applyFacing(this.player, this.charDir, dir, walking)
  }

  // Resolve the ground-tile catalog into a `tileChar -> { key, frame }` lookup
  // for the ground layer. Surface types map onto the town's map chars:
  //   grass -> '.' open ground AND '*' flower patches (same grass cell)
  //   dirt  -> 'g' tall-grass encounter field
  //   road  -> ':' streets, side avenue, entrance stem
  // The spritesheet was loaded in preload(); the cell's frame index is
  // row * columns + col, with columns derived from the loaded image width.
  buildGroundTileMap() {
    const TYPE_TO_CHARS = { grass: ['.', '*'], dirt: ['g'], road: [':'] }
    const out = {}
    for (const t of this._groundTiles || []) {
      // Only fill tiles paint the interior; edge tiles (role: 'edge') are
      // resolved by the boundary pass — Step 2, not yet wired here.
      if (t.role && t.role !== 'fill') continue
      const chars = TYPE_TO_CHARS[t.tile_type]
      if (!chars) continue
      const key = `gtset.${t.tileset}`
      if (!this.textures.exists(key)) continue
      const width = this.textures.get(key).getSourceImage().width
      const cols = Math.max(1, Math.floor(width / t.cell))
      const cell = { key, frame: t.row * cols + t.col }
      for (const ch of chars) out[ch] = cell
    }
    return out
  }

  // Edge + corner tiles from the catalog, as `{ type: { side: { key, frame } } }`.
  // Orthogonal sides (N/E/S/W) are edges, diagonal (NE/NW/SE/SW) are corners;
  // they share the keyspace since the side names don't collide. Fill tiles are
  // ignored here (they live in the fill map).
  buildEdgeMap() {
    const out = {}
    for (const t of this._groundTiles || []) {
      if ((t.role !== 'edge' && t.role !== 'corner') || !t.side) continue
      const key = `gtset.${t.tileset}`
      if (!this.textures.exists(key)) continue
      const cols = Math.max(1, Math.floor(this.textures.get(key).getSourceImage().width / t.cell))
      ;(out[t.tile_type] ||= {})[t.side] = { key, frame: t.row * cols + t.col }
    }
    return out
  }

  // Render the ground as stacked layers (see the call site in create()). Road
  // and dirt form opaque bases under their own cells plus a one-tile halo into
  // the bordering grass, so the grass surface's transparent edge tiles reveal
  // them at the seam while the full road/dirt cells stay visible. The halo is
  // grass-only — it never paints under another surface cell, so e.g. the
  // entrance-stem road that cuts through the dirt field isn't clobbered.
  paintGround() {
    const fill = this.groundTiles
    const edges = this.buildEdgeMap()
    const road = fill[':'] || null
    const dirt = fill.g || null
    const grassFill = fill['.'] || null
    const GRASS_CHARS = new Set(['.', '*', 'T'])
    const DIRS = [
      { d: 'N', dx: 0, dy: -1 },
      { d: 'S', dx: 0, dy: 1 },
      { d: 'E', dx: 1, dy: 0 },
      { d: 'W', dx: -1, dy: 0 },
    ]
    // Outer corners: a diagonal tile spanning two adjacent orthogonal borders.
    const CORNERS = [
      { c: 'NE', a: 'N', b: 'E' },
      { c: 'NW', a: 'N', b: 'W' },
      { c: 'SE', a: 'S', b: 'E' },
      { c: 'SW', a: 'S', b: 'W' },
    ]
    const stamp = (x, y, t, depth, layer) => {
      if (!t) return
      const img = this.add
        .image(x * TILE, y * TILE, t.key, t.frame)
        .setOrigin(0, 0)
        .setDepth(depth)
        .setDisplaySize(TILE, TILE)
      if (DEV && layer) this.devLayers[layer]?.push(img)
    }
    // Is any of the 8 neighbours of `type`? Used for the base halo.
    const nearType = (x, y, type) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          if (typeForTileChar(tileChar(this.town, x + dx, y + dy)) === type) return true
        }
      }
      return false
    }

    for (let y = 0; y < this.town.rows; y++) {
      for (let x = 0; x < this.town.cols; x++) {
        const ch = this.town.map[y][x]
        const isGrass = GRASS_CHARS.has(ch)

        // Base layers — a terrain's own cells, plus a one-tile halo but only
        // under grass (so a road/dirt cell is never covered by the other base).
        if (road && (ch === ':' || (isGrass && nearType(x, y, 'road')))) stamp(x, y, road, 0, 'roadBase')
        if (dirt && (ch === 'g' || (isGrass && nearType(x, y, 'dirt')))) stamp(x, y, dirt, 0.1, 'dirtBase')

        // Surface layer.
        if (ch === ':' || ch === 'g') continue // base is the surface — nothing on top
        if (isGrass) {
          // Which orthogonal sides border a non-grass type.
          const border = {}
          for (const { d, dx, dy } of DIRS) {
            const nType = typeForTileChar(tileChar(this.town, x + dx, y + dy))
            border[d] = Boolean(nType && nType !== 'grass')
          }
          const g = edges.grass || {}
          const used = new Set()
          let drew = false
          // Outer corners first: two adjacent borders (e.g. road to the S and E)
          // collapse to one corner tile instead of two overlapping edges. The
          // corner is mostly grass with a transparent diagonal revealing the
          // base. Falls back to the edge pair if the corner tile isn't tagged.
          for (const { c, a, b } of CORNERS) {
            if (border[a] && border[b] && g[c]) {
              stamp(x, y, g[c], 0.2, 'grassCorner')
              used.add(a)
              used.add(b)
              drew = true
            }
          }
          // Remaining single edges (a transparent fringe toward that side).
          for (const d of ['N', 'E', 'S', 'W']) {
            if (border[d] && !used.has(d) && g[d]) {
              stamp(x, y, g[d], 0.2, 'grassEdge')
              drew = true
            }
          }
          if (!drew) stamp(x, y, grassFill, 0.2, 'grassFill')
          continue
        }
        // Sign + anything unrecognised: procedural texture (opaque) on top.
        const key = keyForTileChar(ch)
        if (key) {
          const img = this.add.image(x * TILE, y * TILE, key).setOrigin(0, 0).setDepth(0.2)
          if (DEV) this.devLayers.grassFill?.push(img)
        }
      }
    }
  }

  // ---- dev-only ground-layer inspector (gated by DEV in create()) ---------
  // A counterpart to the G grid: press L for a legend panel, 1–5 to toggle each
  // ground layer; also exposed as window.__game.layers for the console.
  setupDevLayers() {
    const panel = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e8e8ee',
        backgroundColor: 'rgba(10,12,16,0.82)',
        padding: { x: 8, y: 6 },
        lineSpacing: 2,
      })
      .setScrollFactor(0) // pin to the camera as the player walks
      .setDepth(9001) // above the grid overlay
      .setVisible(false)
    this.devLayerPanel = panel
    this.showLayerPanel = false
    this.refreshDevLayerPanel()

    this.input.keyboard.on('keydown-L', () => {
      this.showLayerPanel = !this.showLayerPanel
      panel.setVisible(this.showLayerPanel)
    })
    DEV_LAYERS.forEach((l, i) => {
      this.input.keyboard.on(`keydown-${DEV_NUM_KEYS[i]}`, () => this.toggleDevLayer(l.key))
    })

    if (typeof window !== 'undefined' && window.__game) {
      window.__game.layers = {
        list: () => DEV_LAYERS.map((l) => ({ ...l, visible: this.layerVisible[l.key] })),
        toggle: (key) => this.toggleDevLayer(key),
        show: (key) => this.setDevLayer(key, true),
        hide: (key) => this.setDevLayer(key, false),
      }
    }
    // eslint-disable-next-line no-console
    console.log('[dev] ground layers: L = panel, 1–5 toggle, or window.__game.layers')
  }

  toggleDevLayer(key) {
    this.setDevLayer(key, !this.layerVisible[key])
  }

  setDevLayer(key, visible) {
    const bucket = this.devLayers?.[key]
    if (!bucket) return
    this.layerVisible[key] = visible
    for (const s of bucket) s.setVisible(visible)
    this.refreshDevLayerPanel()
  }

  // Build the per-cell coordinate labels for the G grid (A1 notation: column
  // letters across, 1-based row numbers down — top-left cell is A1). Kept in a
  // container so the G handler can toggle them all with one setVisible.
  buildGridLabels() {
    const c = this.add.container(0, 0).setDepth(9001)
    for (let y = 0; y < this.town.rows; y++) {
      for (let x = 0; x < this.town.cols; x++) {
        const label = this.add
          .text(x * TILE + 2, y * TILE + 1, `${colLabel(x)}${y + 1}`, {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0, 0)
        c.add(label)
      }
    }
    this.gridLabels = c
  }

  refreshDevLayerPanel() {
    if (!this.devLayerPanel) return
    const lines = ['GROUND LAYERS  (L)']
    DEV_LAYERS.forEach((l, i) => {
      const on = this.layerVisible[l.key]
      const count = this.devLayers[l.key].length
      lines.push(`${i + 1} [${on ? '×' : ' '}] ${l.label}  (${count})`)
    })
    this.devLayerPanel.setText(lines.join('\n'))
  }

  // Build the two-layer building sprite. We don't yet hue-rotate from
  // the community color — Phaser tint is RGB-only and a per-roof
  // hue-rotate would need a custom shader. PR-B accepts a uniform roof
  // color for now; PR-C+ adds the shader / palette-swap.
  addBuildingSprite(community, plot, index = 0) {
    const cx = plot.col * TILE
    const cy = plot.row * TILE
    const w = plot.w * TILE
    const h = plot.h * TILE

    // Which art to use. Falls back to the default if the chosen key never
    // loaded (e.g. a community.building naming art that isn't present).
    let key = buildingKeyFor(community, index)
    if (!this.textures.exists(`building.${key}.roof`)) key = DEFAULT_BUILDING

    // Roof — top 36% of the footprint.
    const roof = this.add
      .image(cx, cy, `building.${key}.roof`)
      .setOrigin(0, 0)
      .setDisplaySize(w, h * 0.36)
      .setDepth((plot.row + plot.h) * 10 - 1)

    // Body — bottom 64%.
    const body = this.add
      .image(cx, cy + h * 0.36, `building.${key}.body`)
      .setOrigin(0, 0)
      .setDisplaySize(w, h * 0.64)
      .setDepth((plot.row + plot.h) * 10 - 1)

    // Nameplate under the building — small text, dark on light.
    const plate = this.add
      .text(cx + w / 2, cy + h - 4, community.title.toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#2c1d10',
        backgroundColor: '#f3e6bb',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 0)
      .setDepth((plot.row + plot.h) * 10 + 1)

    if (DEV) this.devLayers?.buildings?.push(roof, body, plate)

    // Approximate per-community tint by tinting the roof — until we have
    // a hue-rotate shader, this is the cheapest way to differentiate
    // houses visually.
    if (community.color) {
      const hex = parseInt(community.color.replace('#', ''), 16)
      if (!Number.isNaN(hex)) roof.setTint(hex)
    }

    return roof
  }

  // Render tall props from the atlas (townTileset.tallPropsFor). Each is
  // bottom-anchored on its tile so it overflows upward, and depth-sorted by
  // its base row so the player passes in front of / behind it correctly. A
  // prop flagged `blocks` adds its base tile to propCells for walkability.
  addTallProps() {
    this.propCells.clear()
    const tree = this._treeObject
    for (const { key, col, row } of tallPropsFor(this.town)) {
      if (!this.textures.exists(key)) continue
      const def = PROPS[key]
      // Footprint: an admin tree object wins for the tree key; otherwise the
      // bundled prop definition.
      const useTree = key === 'prop.tree' && tree
      const wTiles = (useTree ? tree.footprint_w : def?.wTiles) || 1
      const hTiles = (useTree ? tree.footprint_h : def?.hTiles) || 1
      const sprite = this.add
        .image(col * TILE + TILE / 2, (row + 1) * TILE, key)
        .setOrigin(0.5, 1)
        .setDisplaySize(wTiles * TILE, hTiles * TILE)
        .setDepth((row + 1) * 10 - 1)
      if (DEV) this.devLayers?.trees?.push(sprite)
      if (def?.blocks) this.propCells.add(`${col},${row}`)
    }
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
    const px = spawn.x * TILE + TILE / 2
    const depth = spawn.y * 10 + 5

    if (this.usingManifest) {
      // Manifest sprite: a tightly-cropped sheet, so feet sit on the tile
      // floor (no PLAYER_FEET_LIFT). Origin from the manifest's render block
      // (bottom-centre by convention) so the figure overflows upward.
      const render = this._charManifest.render || { originX: 0.5, originY: 1, scale: 1 }
      this.player = this.add
        .sprite(px, (spawn.y + 1) * TILE, CHAR_SHEET_KEY, this.charDir.down.idleFrame)
        .setOrigin(render.originX, render.originY)
        .setDepth(depth)
      // Scale relative to the 32-px authoring grid → matches the map-preview.
      this.player.setScale(characterScale(this._charManifest))
    } else {
      this.player = this.add
        .image(
          px,
          // Feet anchor at the tile floor — same as the trainer sprite, so
          // side-by-side feet line up. PLAYER_FEET_LIFT accounts for the
          // rpg-char-01 sprite's feet sitting inside its padded display box.
          (spawn.y + 1) * TILE + PLAYER_FEET_LIFT,
          `player.${spawn.facing}.0`,
        )
        .setOrigin(0.5, 1)
        .setDepth(depth)
        // rpg-char-01 has heavy transparent padding inside its 32×32 box, so
        // 96×96 brings the visible body to a Pokémon-faithful on-screen height.
        .setDisplaySize(96, 96)
    }
    this.player.stepCount = 0
    this.updatePlayerFrame()
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15)
  }

}

// Map a tile character to a texture key. Anything boundary-tree-ish (T)
// or unspecified renders as a tree; ground tiles use their dedicated
// textures so the scene matches the DOM engine's look as closely as
// procedural shapes can manage.
// Spreadsheet-style column label for a 0-based column index: 0→A, 25→Z,
// 26→AA, … (rolls to two letters for maps wider than 26 cells).
function colLabel(n) {
  let s = ''
  let i = n + 1 // 1-based for the modulo math
  while (i > 0) {
    const r = (i - 1) % 26
    s = String.fromCharCode(65 + r) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

// Map a tile character to its ground *type* for edge-boundary detection.
// Mirrors the fill mapping (grass '.'/'*', dirt 'g', road ':') and treats
// boundary trees + signs as grass (their ground is grass underneath). Anything
// unrecognised returns null → never an edge neighbour, never receives an edge.
function typeForTileChar(ch) {
  switch (ch) {
    case '.':
    case '*':
    case 'T':
    case 's':
      return 'grass'
    case 'g':
      return 'dirt'
    case ':':
      return 'road'
    default:
      return null
  }
}

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
