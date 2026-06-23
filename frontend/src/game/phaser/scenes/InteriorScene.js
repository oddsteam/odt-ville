import Phaser from 'phaser'
import { TILE, MOVE_MS, PLAYER_FEET_LIFT } from '../../constants.js'
import { ensureInteriorTileTextures } from '../tileTextures.js'
import {
  CHAR_SHEET_KEY,
  buildCharacterRig,
  characterScale,
  applyFacing,
} from '../characterRig.js'
import bus from '../bus.js'
import { resolveDirection, stepTile } from '../movement.ts'
import { initialPerfStallState, observeFrame } from '../perfStall.ts'

// Mirrors the layout in src/game/buildInterior.js so the spatial behavior
// matches the DOM engine tile-for-tile.
const ROOM_COLS = 11
const ROOM_ROWS = 8
const BOARD_COLS = [3, 5, 7] // Must Know, Should Know, Nice to Know (L→R)
const BOARD_ROW = 1
const DOOR_COL = 5
const DOOR_ROW = ROOM_ROWS - 1

const BOARD_TYPES = ['must_know', 'should_know', 'nice_to_know']
const BOARD_LABELS = {
  must_know: 'MUST KNOW',
  should_know: 'SHOULD KNOW',
  nice_to_know: 'NICE TO KNOW',
}
// Coral / amber / soft-green — same hex codes as the DOM engine's
// `--board-paper` per board type.
const BOARD_COLORS = {
  must_know: 0xf7c1bb,
  should_know: 0xf7e3a0,
  nice_to_know: 0xc6e8b8,
}

// The community interior scene. Mounted by Phaser when the town scene
// detects a door entry. Owns its own player, walk loop, A-press handling,
// and exit detection. Emits three bus events to the React shell:
//
//   'openBoard'      (boardType: string) — A on a board
//   'exitCommunity'  (communityId: number) — south onto the door tile
//
// The actual community payload comes through `init({ community })`; the
// scene reads it as the active community to label the topbar / banner
// and to send back with exitCommunity.
export default class InteriorScene extends Phaser.Scene {
  constructor() {
    super('Interior')
    this.community = null
    this.player = null
    this.playerTile = { x: DOOR_COL, y: DOOR_ROW - 1 }
    this.facing = 'up'
    this.movingTween = null
    this.exiting = false
    // Manifest character — shared with TownScene (same registry manifest + the
    // CHAR_SHEET_KEY texture/anims TownScene built). False → bundled player.
    this._charManifest = null
    this.usingManifest = false
    this.charDir = null
  }

  init(data) {
    this.community = data?.community || null
    this.playerTile = { x: DOOR_COL, y: DOOR_ROW - 1 }
    this.facing = 'up'
    this.exiting = false
    // Same reason as TownScene.init: a leftover movingTween reference
    // from a previous interior visit would freeze movement, because
    // update()'s `if (this.movingTween) return` would think we're still
    // mid-walk.
    this.movingTween = null
    this.dpadDir = null
    this.perfStall = initialPerfStallState()
  }

  create() {
    ensureInteriorTileTextures(this)

    const worldW = ROOM_COLS * TILE
    const worldH = ROOM_ROWS * TILE

    // We do NOT call scale.resize here. The canvas already matches
    // .gb-screen at 1:1 via PhaserGame's Scale.RESIZE — same as
    // TownScene — so tiles render at TILE=48 device pixels and the
    // character is positioned with the same math as in the town.
    // Instead, centre the camera on the room so the small interior
    // sits in the middle of the screen with empty bezel around it
    // (and re-centre whenever the canvas resizes).
    const centerCamera = () => {
      const cw = this.scale.gameSize.width
      const ch = this.scale.gameSize.height
      this.cameras.main.setScroll(
        (worldW - cw) / 2,
        (worldH - ch) / 2,
      )
    }
    centerCamera()
    this.scale.on('resize', centerCamera)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', centerCamera)
    })

    // No setBounds here: bounds would clamp our negative scroll
    // (world is smaller than the canvas) and snap the room to one
    // edge. The player can only move within walls anyway.

    // Floor + walls + door tile. Walls block the player; the door tile is
    // walkable but stepping onto it triggers exit instead of a real move.
    for (let y = 0; y < ROOM_ROWS; y++) {
      for (let x = 0; x < ROOM_COLS; x++) {
        const onBorder =
          y === 0 || y === ROOM_ROWS - 1 || x === 0 || x === ROOM_COLS - 1
        if (onBorder && !(y === DOOR_ROW && x === DOOR_COL)) {
          this.add.image(x * TILE, y * TILE, 'interior.wall').setOrigin(0, 0)
        } else if (y === DOOR_ROW && x === DOOR_COL) {
          this.add
            .image(x * TILE, y * TILE, 'interior.doormat')
            .setOrigin(0, 0)
          // "EXIT" text overlay on the doormat.
          this.add
            .text(x * TILE + TILE / 2, y * TILE + TILE / 2, 'EXIT', {
              fontFamily: 'monospace',
              fontSize: '10px',
              fontStyle: 'bold',
              color: '#2c1d10',
            })
            .setOrigin(0.5, 0.5)
        } else {
          this.add.image(x * TILE, y * TILE, 'interior.floor').setOrigin(0, 0)
        }
      }
    }

    // Back-wall accent banner — a 12 px strip along the top wall in the
    // community's colour. Matches the CSS rule that tints the first row
    // of walls in the DOM engine via the room-accent variable.
    const accent = this.community?.color || '#c7a76a'
    const accentHex = parseInt(accent.replace('#', ''), 16) || 0xc7a76a
    const banner = this.add.graphics()
    banner.fillStyle(accentHex, 1)
    // The wall tile is 48 px tall; the DOM banner is the bottom 12 px of
    // the back-wall row, so we draw a 12 px strip just below the wall.
    banner.fillRect(0, TILE - 12, ROOM_COLS * TILE, 12)
    banner.setDepth(1)

    // Boards — wood-framed coloured tiles with a 2- or 3-line label
    // centered, plus an optional urgent badge on Must Know.
    this.boards = BOARD_COLS.map((col, i) => {
      const boardType = BOARD_TYPES[i]
      const cx = col * TILE
      const cy = BOARD_ROW * TILE
      // Frame.
      const frame = this.add.graphics()
      frame.fillStyle(0x432a14, 1)
      frame.fillRect(cx + 1, cy + 1, TILE - 2, TILE - 2)
      frame.fillStyle(BOARD_COLORS[boardType], 1)
      frame.fillRect(cx + 4, cy + 4, TILE - 8, TILE - 8)
      // Drop shadow underneath.
      frame.fillStyle(0x000000, 0.35)
      frame.fillRect(cx + 1, cy + TILE - 2, TILE - 2, 3)
      frame.setDepth(50)
      // Label — break into words so 3-line labels (NICE TO KNOW) stack.
      const labelText = BOARD_LABELS[boardType].replace(/ /g, '\n')
      const label = this.add
        .text(cx + TILE / 2, cy + TILE / 2, labelText, {
          fontFamily: 'monospace',
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#2c1d10',
          align: 'center',
        })
        .setOrigin(0.5, 0.5)
        .setDepth(51)

      // Urgent badge — only on Must Know, only when the community has
      // urgent items waiting.
      const urgent = this.community?.badges?.urgent || 0
      if (boardType === 'must_know' && urgent > 0) {
        const badgeG = this.add.graphics()
        badgeG.fillStyle(0xd22d2d, 1)
        badgeG.fillCircle(cx + TILE - 8, cy - 2 + 10, 9)
        badgeG.lineStyle(2, 0x2c1d10, 1)
        badgeG.strokeCircle(cx + TILE - 8, cy - 2 + 10, 9)
        badgeG.setDepth(52)
        this.add
          .text(cx + TILE - 8, cy + 8, String(urgent), {
            fontFamily: 'monospace',
            fontSize: '10px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0.5, 0.5)
          .setDepth(53)
      }
      return { boardType, col, row: BOARD_ROW, frame, label }
    })

    // Player sprite — same display math as TownScene so the avatar sits at the
    // same scale and height-relative-to-tile in both scenes. Textures (bundled
    // frames + the manifest sheet/anims) are shared with TownScene; they were
    // built there and are still in the cache when Phaser scene-starts to us.
    this._charManifest = this.registry.get('characterManifest') || null
    const rig = buildCharacterRig(this, this._charManifest)
    this.usingManifest = rig.usingManifest
    this.charDir = rig.charDir

    const px = this.playerTile.x * TILE + TILE / 2
    const depth = this.playerTile.y * 10 + 5
    if (this.usingManifest) {
      const render = this._charManifest.render || { originX: 0.5, originY: 1, scale: 1 }
      this.player = this.add
        .sprite(px, (this.playerTile.y + 1) * TILE, CHAR_SHEET_KEY, this.charDir.down.idleFrame)
        .setOrigin(render.originX, render.originY)
        .setDepth(depth)
      this.player.setScale(characterScale(this._charManifest))
    } else {
      this.player = this.add
        .image(
          px,
          (this.playerTile.y + 1) * TILE + PLAYER_FEET_LIFT,
          `player.${this.facing}.0`,
        )
        .setOrigin(0.5, 1)
        .setDepth(depth)
        // Same display size as TownScene (rpg-char-01 padding compensation).
        .setDisplaySize(96, 96)
    }
    this.player.stepCount = 0
    if (this.usingManifest) applyFacing(this.player, this.charDir, this.facing, false)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    })
    // A button — Enter or Space.
    this.aKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    )
    this.spaceKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    )
    // Overlay D-pad + A — same bus pattern as TownScene.
    this.dpadDir = null
    this._onDpadPress = (d) => {
      this.dpadDir = d
    }
    this._onDpadRelease = (d) => {
      if (this.dpadDir === d) this.dpadDir = null
    }
    this._onABtn = () => this.pressA()
    bus.on('dpadPress', this._onDpadPress)
    bus.on('dpadRelease', this._onDpadRelease)
    bus.on('aButton', this._onABtn)

    if (typeof window !== 'undefined') {
      window.__game = {
        engine: 'phaser',
        activeSceneKey: () => this.scene.key,
        playerTile: () => ({ ...this.playerTile }),
        boards: () =>
          this.boards.map((b) => ({
            type: b.boardType,
            label: BOARD_LABELS[b.boardType],
          })),
        community: () =>
          this.community
            ? {
                id: this.community.id,
                title: this.community.title,
                color: this.community.color,
              }
            : null,
      }
    }

    // Keyboard repeat-control: only fire on initial keydown for A, not
    // every frame the key is held.
    this.input.keyboard.on('keydown-ENTER', this.pressA, this)
    this.input.keyboard.on('keydown-SPACE', this.pressA, this)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown-ENTER', this.pressA, this)
      this.input.keyboard.off('keydown-SPACE', this.pressA, this)
      bus.off('dpadPress', this._onDpadPress)
      bus.off('dpadRelease', this._onDpadRelease)
      bus.off('aButton', this._onABtn)
    })
  }

  update(_time, delta) {
    this.observePerf(delta)
    if (this.exiting || this.movingTween) return
    const dir = this.activeDirection()
    if (dir) this.step(dir)
  }

  // See TownScene.observePerf — same detector, same once-fire semantics.
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

  activeDirection() {
    return resolveDirection({
      dpadDir: this.dpadDir,
      cursors: this.cursors,
      wasd: this.wasd,
    })
  }

  step(dir) {
    this.facing = dir
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
    const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
    const tx = this.playerTile.x + dx
    const ty = this.playerTile.y + dy

    // Door tile — south wall, centre. Stepping here leaves the interior.
    if (tx === DOOR_COL && ty === DOOR_ROW) {
      this.exiting = true
      const id = this.community?.id ?? null
      bus.emit('exitCommunity', id)
      this.scene.start('Town', { exitedCommunityId: id })
      return
    }

    const result = stepTile({
      scene: this,
      target: this.player,
      from: this.playerTile,
      dir,
      walkable: (x, y) => this.walkable(x, y),
      // Feet land at the destination tile's floor. The bundled rpg-char-01
      // needs PLAYER_FEET_LIFT for its padded box; the manifest sprite is
      // tightly cropped, so its feet sit on the floor — see TownScene.
      toWorldXY: (t) => ({
        x: t.x * TILE + TILE / 2,
        y: (t.y + 1) * TILE + (this.usingManifest ? 0 : PLAYER_FEET_LIFT),
      }),
      duration: MOVE_MS,
      onStart: (t) => {
        this.playerTile = t
        this.setPlayerWalking(true)
      },
      onBlocked: () => this.setPlayerWalking(false),
      onArrive: () => {
        this.movingTween = null
        if (this.usingManifest) {
          if (!this.activeDirection()) applyFacing(this.player, this.charDir, this.facing, false)
        } else {
          this.player.setTexture(`player.${this.facing}.0`)
        }
      },
    })
    this.movingTween = result.tween
  }

  // Walking vs standing frame for the current facing — manifest anim or the
  // bundled two-frame walk cycle (0 still, 1/2 step A/B). Mirrors TownScene.
  setPlayerWalking(walking) {
    if (this.usingManifest) {
      applyFacing(this.player, this.charDir, this.facing, walking)
    } else if (walking) {
      this.player.setTexture(`player.${this.facing}.${(this.player.stepCount++ % 2) + 1}`)
    } else {
      this.player.setTexture(`player.${this.facing}.0`)
    }
  }

  // Interior walkability — same WALKABLE set as buildInterior.js: '.', 'D'.
  // Boards and walls block. Out-of-bounds blocks too.
  walkable(x, y) {
    if (x <= 0 || x >= ROOM_COLS - 1 || y <= 0 || y >= ROOM_ROWS - 1) {
      // Interior bounds — only the door tile is walkable in the border.
      return false
    }
    // Boards block their tile.
    if (y === BOARD_ROW && BOARD_COLS.includes(x)) return false
    return true
  }

  // Press A — interact with the tile in front of you (if it's a board).
  pressA() {
    if (this.exiting) return
    const dx = this.facing === 'left' ? -1 : this.facing === 'right' ? 1 : 0
    const dy = this.facing === 'up' ? -1 : this.facing === 'down' ? 1 : 0
    const fx = this.playerTile.x + dx
    const fy = this.playerTile.y + dy
    const board = this.boards.find((b) => b.col === fx && b.row === fy)
    if (board) bus.emit('openBoard', board.boardType)
  }
}
