import Phaser from 'phaser'
import { TILE, MOVE_MS, PLAYER_FEET_LIFT } from '../../constants.js'
import { buildTownMap } from '../../townMap.ts'
import { catalogFromGroundTiles, HOMETOWN_CATALOG } from '../../../kernel/tileCatalog.ts'
import { isWalkable, edgeBlocked, playerDepthAt, isLadderCell, doorAnchorFor, footprintFor, walkMaskFor, edgeMaskFor } from '../../town.ts'
import { ensureTileTextures } from '../tileTextures.js'
import { isTransitioning } from '../../transition.ts'
import {
  CHAR_SHEET_KEY,
  buildCharacterRig,
  characterScale,
  applyFacing,
} from '../characterRig.js'
import bus from '../bus.js'
import { resolveDirection, stepTile } from '../movement.ts'
import { initialPerfStallState, observeFrame } from '../perfStall.ts'
import { interiorPortal } from '../townInteractions.ts'
import { render, setupDevTools, preloadAssets, tilesetColumns } from '../townRenderer.ts'
import { sightCells, sightZoneEvents, zoneEvents } from '../../../kernel/zones.ts'

// Asset URLs are imported by PhaserGame and pushed into the registry so a
// scene doesn't need to know module paths. The registry shape:
//   {
//     spritesheets: { player: { url, frames } },
//     buildings:    { roofUrl, bodyUrl },
//     communities:  Community[],
//     session:      { spawn: { last_community_id } },
//   }

// Trainer sprites get bucketed into the renderer's dev-layer inspector when
// it's active. Statically false in production builds, so Vite strips the pushes.
const DEV = import.meta.env.DEV

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
    // Gate-trainer presentation state, read off the town's on_sight zone
    // (#255): a single sprite at the zone's tile, with the kernel's sight
    // cells drawn in front of him. Stepping into the cone fires the zone
    // through `onZone`; after the player runs away once, `defeated` flips on
    // and the markers hide.
    this.trainer = null // { x, y }
    this.trainerSprite = null
    this.sightCells = []
    this.sightGraphics = null // pulsing red markers
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
    this.perfStall = initialPerfStallState()
  }

  preload() {
    // All texture loading (player, manifest, buildings, trainer, props, ground
    // tiles) lives in the renderer; it stashes the manifest / tree object /
    // ground catalog back onto the scene for create() + render().
    preloadAssets(this)
  }

  // Boot the scene as an ordered sequence of setup steps. Each step below is a
  // named private method so this reads as the scene's lifecycle at a glance;
  // the ordering is load-bearing (dev tools hang off the test API, shutdown
  // tears down what the earlier steps subscribed).
  create() {
    this.buildWorld()

    // Slice the manifest sheet into frames + walk anims (no-op when there's no
    // manifest, leaving usingManifest false → bundled-frame player).
    this.setupCharacter()

    // Player sprite + spawn. Falls back to the entrance if the session is
    // empty or names a community that no longer exists.
    this.spawnPlayer(this.registry.get('session') || null)

    // Gate trainer (PR-D) — presentation for the producer's on_sight zone
    // (#255), so position follows the entrance even when the town reshapes.
    // Defeated state is read from the registry.
    this.addGateTrainer()

    // Keyboard + overlay D-pad, both feeding activeDirection().
    this.setupInput()

    // Gated-door resolution handed back from the shell (issue #24).
    this.setupEntryResolution()

    // Playwright introspection hook (window.__game).
    this.exposeTestApi()

    // Dev-only tile grid (G) + ground-layer inspector (L), wired after the test
    // API so the inspector can hang off window.__game. Stripped in production.
    setupDevTools(this)

    // React → Phaser registry watchers + the EncounterScene resume hook.
    this.setupSceneEvents()

    // Tear down every subscription the steps above registered on shutdown.
    this.setupShutdown()
  }

  // Build the town world and lay it down: the baked map (converged producer),
  // the ground stack the renderer reads back, the camera bounds, and the static
  // ground/props/buildings paint.
  buildWorld() {
    ensureTileTextures(this)

    const communities = this.registry.get('communities') || []

    // Town geometry is identical to the DOM engine's — we keep a single
    // source of truth in constants.js so PR-B doesn't drift from the
    // game's design data.
    // An admin-mapped house (#29) overrides the hardcoded bottom-centre door
    // with its authored anchor; absent → default (doorAnchorFor returns undefined).
    // It also drives each plot's footprint (#30, clamped 3..15 x 4..15) so a
    // non-3x4 house renders undistorted with the grid re-spaced around it.
    const buildingObject = this.registry.get('buildingObject') || null
    // The converged producer (#171, ADR-0003/0004): one call generates the
    // layout AND bakes its ground through the shared engine, against a catalog
    // assembled from the mapped ground tiles (art) + the hometown's OWN terrain
    // order. The order is deliberately NOT the terrains-table priority the map
    // editor reorders — /admin/maps must never reshape the hometown. A hometown
    // admin config can replace this constant later (Hometown Policy seam).
    const catalog = catalogFromGroundTiles(
      this.registry.get('groundTiles') || [],
      tilesetColumns(this),
      HOMETOWN_CATALOG.stack,
    )
    // The renderer reads the stack to map baked depths (index × 0.1) back to
    // terrain names for the dev-layer inspector and the sign's above-ground depth.
    this._groundStack = catalog.stack
    this.town = buildTownMap(
      Math.max(communities.length, 1),
      catalog,
      doorAnchorFor(buildingObject),
      footprintFor(buildingObject),
      // Authored interior walk mask (#32): which footprint cells the avatar may
      // stand on. Stamped onto every plot; absent → solid box (just the door).
      walkMaskFor(buildingObject),
      // Authored impassable cell borders (#53): which footprint-cell sides the
      // avatar cannot step across. Absent → today's free movement.
      edgeMaskFor(buildingObject),
      // Hometown Policy (#173): the active foliage objects, resolved to placed
      // entities at generation time and rendered via the shared entity loader.
      this.registry.get('hometownPolicy') || null,
    )

    // With Scale.RESIZE in PhaserGame, the canvas display size matches
    // .gb-screen at 1:1 device pixels (TILE=48 → 48 screen px, same as
    // DOM). We do NOT call scale.resize here: that would re-size the
    // canvas to the world size and the player would see everything at
    // once. The camera's setBounds caps scroll to the world's edges.
    const worldW = this.town.cols * TILE
    const worldH = this.town.rows * TILE
    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.physics?.world.setBounds(0, 0, worldW, worldH)

    // Paint the static town — the producer-baked ground blit, tall props, and
    // building sprites with nameplates. Sets this.buildings / this.propCells,
    // plus the dev-layer buckets render fills for setupDevTools.
    render(this)
  }

  // Keyboard input (cursor keys + WASD) and the React overlay D-pad, both
  // resolved through activeDirection() so on-screen and physical keys behave
  // identically.
  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    })
    // React emits D-pad press/release events on the bus so we drive movement
    // from tap/click input the same way keyboard input feeds activeDirection().
    this.dpadDir = null
    this._onDpadPress = (d) => {
      this.dpadDir = d
    }
    this._onDpadRelease = (d) => {
      if (this.dpadDir === d) this.dpadDir = null
    }
    bus.on('dpadPress', this._onDpadPress)
    bus.on('dpadRelease', this._onDpadRelease)
  }

  // Gated-door resolution from the shell (issue #24). handleArrival paused us
  // and emitted 'requestEntry'; the shell runs the gate, then reports back:
  // enter the community on a pass, just resume in place (release) on a fail.
  setupEntryResolution() {
    this._onEntryResolved = ({ communityId, granted }) => {
      const b = this.buildings.find((x) => x.community.id === communityId)
      if (granted && b) {
        this.enterHouse(b.community)
      } else {
        this.scene.resume()
      }
    }
    bus.on('entryResolved', this._onEntryResolved)
    // Portal travel failed or was refused (#111): release the avatar in place,
    // like a failed gate — the door stays, entry is what's refused.
    this._onPortalResolved = ({ granted }) => {
      if (!granted) this.scene.resume()
    }
    bus.on('portalResolved', this._onPortalResolved)
  }

  // Through the door. A community with an authored interior Node travels
  // (#111, ADR-0005): pause and hand the portal to the shell, which loads the
  // target before leaving (#84) and swaps to MapScene on success — or releases
  // us on failure. Without one, the hardcoded InteriorScene (the v0 Node).
  enterHouse(community) {
    const portal = interiorPortal(community)
    if (portal) {
      this.scene.pause()
      bus.emit('requestPortal', { communityId: community.id, portal })
    } else {
      bus.emit('enterCommunity', community.id)
      this.scene.start('Interior', { community })
    }
  }

  // Test API. PR-A only exposed `engine`; PR-B+ hang reads off the
  // same object so Playwright can introspect scene state without
  // poking around Phaser internals.
  exposeTestApi() {
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
  }

  // React → Phaser registry watchers. The rule for what the scene
  // subscribes to: **structural data is a scene-boot input, not a
  // live data source.** The community list (positions, titles,
  // colours) and the session are read once by spawnPlayer +
  // render() during create() and never re-read mid-scene.
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
  setupSceneEvents() {
    this.registry.events.on('changedata-trainerDefeated', this.refreshTrainerVisuals, this)

    // When EncounterScene closes it scene.resume()s us; this is the
    // hook to re-arm grace steps after a wild run.
    this.events.on(Phaser.Scenes.Events.RESUME, this.handleResume, this)
  }

  // Unsubscribe everything create() wired up when the scene shuts down.
  setupShutdown() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata-trainerDefeated', this.refreshTrainerVisuals, this)
      this.events.off(Phaser.Scenes.Events.RESUME, this.handleResume, this)
      bus.off('dpadPress', this._onDpadPress)
      bus.off('dpadRelease', this._onDpadRelease)
      bus.off('entryResolved', this._onEntryResolved)
      bus.off('portalResolved', this._onPortalResolved)
      if (typeof window !== 'undefined' && window.__game?.engine === 'phaser') {
        delete window.__game
      }
    })
  }

  update(_time, delta) {
    this.observePerf(delta)
    // Mid-warp (#254): refuse held-key steps while the exit-to-town fade plays,
    // so a banked step doesn't fire the instant the town lands.
    if (isTransitioning()) return
    if (this.movingTween) return // already animating to next tile
    const dir = this.activeDirection()
    if (dir) this.step(dir)
  }

  // Feed the frame delta into the stall detector. A throttling browser
  // extension produces multi-hundred-millisecond freezes in the RAF loop;
  // after the threshold trips enough times we fire `perfStall` once on the
  // bus so the React shell can surface a dismissible hint. console.warn
  // helps anyone reading devtools spot the same condition.
  observePerf(delta) {
    if (typeof delta !== 'number' || !Number.isFinite(delta)) return
    const r = observeFrame(this.perfStall, delta)
    this.perfStall = r.state
    if (r.fire) {
      // eslint-disable-next-line no-console
      console.warn('[perf] repeated long frames detected — likely a browser extension throttling the game loop')
      bus.emit('perfStall')
    }
  }

  // ---- helpers ------------------------------------------------------

  // Resolve which direction is currently held — delegated to the shared
  // movement module so InteriorScene resolves the same way.
  activeDirection() {
    return resolveDirection({
      dpadDir: this.dpadDir,
      cursors: this.cursors,
      wasd: this.wasd,
    })
  }

  // One tile step. The shared movement module owns the walkable check + tween;
  // the town-specific door collision and trainer/wild-grass arrival checks are
  // wired in here as callbacks.
  step(dir) {
    this.facing = dir
    // Where the step began — the zone detectors are edge-aware, so arrival
    // needs the previous tile after onStart has advanced playerTile.
    const from = { ...this.playerTile }
    const result = stepTile({
      scene: this,
      target: this.player,
      from,
      dir,
      walkable: (x, y) => this.walkable(x, y),
      // #53: refuse a step across an authored impassable cell border, even when
      // both cells are walkable (a balcony-over-overhang ledge reads like a wall).
      transitionBlocked: (from, to) => edgeBlocked(this.buildings, from.x, from.y, to.x, to.y),
      // Feet land at the destination tile's floor (matches setOrigin). The
      // bundled rpg-char-01 needs PLAYER_FEET_LIFT for its padded box; the
      // manifest sprite is tightly cropped, so its feet sit on the floor.
      toWorldXY: (t) => ({
        x: t.x * TILE + TILE / 2,
        y: (t.y + 1) * TILE + (this.usingManifest ? 0 : PLAYER_FEET_LIFT),
      }),
      duration: MOVE_MS,
      onStart: (t) => {
        this.playerTile = t
        // Depth tracks the player's current row so south-of-player buildings
        // (higher row → higher depth) draw on top and north-of-player
        // buildings (lower row → lower depth) draw behind. Stepping onto a door
        // tile elevates above that building from the start of the step, so the
        // avatar rises into the doorway instead of sliding under it (issue #22).
        this.player.setDepth(playerDepthAt(this.buildings, t.x, t.y))
        this.setPlayerWalking(true)
      },
      onBlocked: () => this.setPlayerWalking(false),
      onArrive: (t) => {
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
        // Arrival interactions: the door first (it short-circuits), then the
        // town's zones through the one onZone channel (#255).
        this.handleArrival(from, t)
      },
    })
    this.movingTween = result.tween
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

  // Run the arrival interactions for a tile: a door enters the community (and
  // stops there); otherwise the step runs against the town's zones through the
  // same pure detectors + `onZone` channel MapScene uses (#255). The shell
  // dispatches the payloads — the grass roll, its grace steps, and the duel
  // all live there now.
  handleArrival(from, t) {
    const door = this.buildings.find((b) => b.doorCol === t.x && b.doorRow === t.y)
    if (door) {
      const gate = door.community.entry_gate ?? null
      if (gate) {
        // Gated door: stop at the doorway (already depth-elevated + facing up),
        // freeze the world, and hand the gate off to the shell. The shell runs
        // it and resumes us on pass / release on fail (issue #24). Dormant until
        // a community carries entryGate, so no resumer is needed yet.
        this.scene.pause()
        bus.emit('requestEntry', { communityId: door.community.id, gate })
      } else {
        this.enterHouse(door.community)
      }
      return
    }

    const onZone = this.registry.get('onZone')
    if (!onZone) return
    const zones = this.activeZones()
    for (const ev of zoneEvents(from, t, zones)) onZone(ev.trigger, ev.zone)
    for (const ev of sightZoneEvents(from, t, zones)) onZone(ev.trigger, ev.zone)
  }

  // The zones a step can fire: all of them, minus the trainer's cone once he
  // is defeated — defeated trainers still stand there, but challenge nobody.
  activeZones() {
    const zones = this.town.zones || []
    return this.registry.get('trainerDefeated')
      ? zones.filter((z) => z.payload.kind !== 'trainer')
      : zones
  }

  handleResume() {
    // EncounterScene exited. trainerDefeated may have flipped via the bus;
    // refresh visuals (the wild grace steps are the shell gate's business).
    this.refreshTrainerVisuals()
  }

  // Walkability check — delegates to the pure town/World rule. The scene only
  // assembles the dynamic blockers: tall props plus the gate-trainer tile
  // (defeated trainers still stand there in Pokémon, you walk around).
  walkable(x, y) {
    const blockers = new Set(this.propCells)
    if (this.trainer) blockers.add(`${this.trainer.x},${this.trainer.y}`)
    return isWalkable(this.town, this.buildings, blockers, x, y)
  }

  // Place the gate trainer + render his line-of-sight markers, both read off
  // the producer's on_sight zone (#255) — the kernel's sightCells are the very
  // cells the detector fires on. Called once on scene boot, after the
  // buildings + player are positioned so depth-sorting comes out right.
  addGateTrainer() {
    const zone = (this.town.zones || []).find((z) => z.trigger === 'on_sight')
    if (!zone) return
    const start = { x: zone.x, y: zone.y }
    this.trainer = start
    this.sightCells = sightCells(zone)

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
    if (!this.usingManifest) return
    // Climb on a ladder cell (#54): the avatar's current tile decides whether
    // the walk loop is swapped for the climb posture (walk fallback in the rig).
    const t = this.playerTile
    const climbing = isLadderCell(this.buildings, t.x, t.y)
    applyFacing(this.player, this.charDir, dir, walking, climbing)
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
      ? { x: b.doorCol, y: b.doorRow + 1, facing: 'down' }
      : { x: this.town.entrance.x, y: this.town.entrance.y, facing: 'up' }

    this.playerTile = { x: spawn.x, y: spawn.y }
    this.facing = spawn.facing
    const px = spawn.x * TILE + TILE / 2
    // Same depth rule as a normal step (#46): exiting a building spawns us on
    // the tile south of the door, which may be a footprint cell under the house
    // sprite — playerDepthAt lifts us above it so we don't respawn invisible.
    const depth = playerDepthAt(this.buildings, spawn.x, spawn.y)

    if (this.usingManifest) {
      // Manifest sprite: a tightly-cropped sheet, so feet sit on the tile
      // floor (no PLAYER_FEET_LIFT). Origin from the manifest's render block
      // (bottom-centre by convention) so the figure overflows upward.
      const renderCfg = this._charManifest.render || { originX: 0.5, originY: 1, scale: 1 }
      this.player = this.add
        .sprite(px, (spawn.y + 1) * TILE, CHAR_SHEET_KEY, this.charDir.down.idleFrame)
        .setOrigin(renderCfg.originX, renderCfg.originY)
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
