import Phaser from 'phaser'
import { TILE, MOVE_MS, buildTown, tileChar } from '../../constants.js'
import { ensureTileTextures } from '../tileTextures.js'
import bus from '../bus.js'

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
  }

  init(data) {
    this.exitedCommunityId = data?.exitedCommunityId ?? null
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
  }

  create() {
    ensureTileTextures(this)

    const communities = this.registry.get('communities') || []
    const session = this.registry.get('session') || null

    // Town geometry is identical to the DOM engine's — we keep a single
    // source of truth in constants.js so PR-B doesn't drift from the
    // game's design data.
    this.town = buildTown(Math.max(communities.length, 1))

    // Resize the scene to match the generated town. Phaser's Scale.FIT in
    // PhaserGame will scale the whole thing to the host element.
    const worldW = this.town.cols * TILE
    const worldH = this.town.rows * TILE
    this.scale.resize(worldW, worldH)
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

    // Keyboard input — Phaser's cursor keys + WASD via additional keys.
    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    })

    // Test API. PR-A only exposed `engine`; we hang playerTile() and
    // buildings() off the same object so Playwright can read scene state
    // without poking around Phaser internals.
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
      }
    }

    // React → Phaser registry watchers — when the shell pushes a new
    // communities/session payload (e.g. admin added a house), rebuild.
    this.registry.events.on('changedata-communities', this.handleRegistryChange, this)
    this.registry.events.on('changedata-session', this.handleSessionChange, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata-communities', this.handleRegistryChange, this)
      this.registry.events.off('changedata-session', this.handleSessionChange, this)
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
  activeDirection() {
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
      // Bumped a wall — just turn in place via facing direction; sprite
      // updates next frame.
      this.updatePlayerFrame()
      return
    }

    this.playerTile = { x: tx, y: ty }
    this.updatePlayerFrame()
    this.movingTween = this.tweens.add({
      targets: this.player,
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      duration: MOVE_MS,
      onComplete: () => {
        this.movingTween = null
      },
    })
  }

  // Walkability check — ground class + building footprint exclusion.
  // Doors are walkable: they're how the player enters.
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
    return true
  }

  // Cycle through the four-frame walk strip. For a single press the
  // sprite ends back at frame 0 (still). For a moving step we pick a
  // frame based on the cumulative step count to alternate left / right
  // foot, same effect as the DOM <PlayerSprite>.
  updatePlayerFrame() {
    const idx = this.movingTween ? (this.player.stepCount % 3) + 1 : 0
    this.player.setTexture(`player.${this.facing}.${idx}`)
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
        spawn.y * TILE + TILE / 2,
        `player.${spawn.facing}.0`,
      )
      .setOrigin(0.5, 0.5)
      .setDepth(spawn.y * 10 + 5)
    this.player.stepCount = 0
    this.updatePlayerFrame()
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15)
  }

  // Communities changed (admin added/deleted/reordered) — rebuild the
  // town. PR-B keeps this dumb (full restart of the scene) because
  // partial rebuilds add a lot of bookkeeping for a thing that happens
  // once per admin action.
  handleRegistryChange() {
    this.scene.restart()
  }

  // Session changed (the React shell's optimistic post-exit update) —
  // re-spawn the player at the new last-community doormat.
  handleSessionChange() {
    const session = this.registry.get('session')
    const id = session?.spawn?.last_community_id
    const b = id != null ? this.buildings.find((x) => x.community.id === id) : null
    if (!b) return
    this.playerTile = { x: b.doorCol, y: b.doorRow + 1 }
    this.facing = 'up'
    this.player.setPosition(
      this.playerTile.x * TILE + TILE / 2,
      this.playerTile.y * TILE + TILE / 2,
    )
    this.updatePlayerFrame()
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
