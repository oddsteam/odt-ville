import Phaser from 'phaser'
import {
  POSTURE_KEYS,
  resolveSheetSrc,
  framesForFacing,
} from '../character/manifest.js'
import { openVideoModal } from './videoModal.js'

// Standalone preview of a Tiled map exported from tipco/downtown.tmx.
// Renders the four tile layers and enforces the `collisions` object group.
//
// Collision model: the object group's rectangles + polygon are rasterized
// onto the 32-px tile grid (a cell blocks if its centre falls inside any
// collision shape). Movement is grid-stepped — the same feel as the main
// game's TownScene — so "walk into a building and stop" reads clearly.
// Press C to overlay the blocked cells in red.

const MAP_KEY = 'downtown'
const MAP_URL = '/maps/downtown.json'
const TILE = 32
const STEP_MS = 130

// The player character is manifest-driven: a posture→frame-rects mapping
// (src/character/manifest.js, public/maps/characters/*.json) authored in the
// sprite-mapper tool. main.js resolves the active manifest and hands it to the
// scene via the game registry; we register each rect as a named frame on one
// loaded sheet texture and build an anim per walk posture.
const SHEET_KEY = 'char-sheet'

// Tileset name (as written in the JSON) -> bundled image URL. The name must
// match addTilesetImage's first arg so createLayer can resolve gids.
const TILESETS = [
  '1_Terrains_and_Fences_32x32',
  '2_City_Terrains_32x32',
  '5_Floor_Modular_Buildings_32x32',
  '4_Generic_Buildings_32x32',
  '10_Vehicles_32x32',
  'Interiors_free_32x32',
]

const LAYER_NAMES = ['road', 'pavement', 'buildings', 'props']

// Named collision objects that should also visually occlude the player: when
// the player stands north of one (its feet above the object's bottom edge), it
// is drawn *under* the object so it doesn't paint over a car/bus it's walking
// behind. Walking south of it, the player is in front (normal high depth).
// `props` (the vehicle tiles) is the last tile layer at depth 3, so the
// "behind" depth sits just under it but above the buildings layer (depth 2).
const OCCLUDER_NAMES = new Set(['car', 'bus'])
const PLAYER_FRONT_DEPTH = 100
const PLAYER_BEHIND_DEPTH = 2.5

// Building overlays — text panels / images drawn over a building at runtime,
// anchored to the named objects in the Tiled `collisions` group (building1,
// main-building, …). This is the programmatic alternative to baking labels
// into the PNG or the Tiled map: each entry is keyed by the object's name.
//   text  — string painted on a "blank panel" (a filled rounded rect)
//   image — texture key to load + stamp instead of text (see SIGN_IMAGES)
//   yFactor — 0 = footprint centre, negative = toward the top/face (default -0.18)
// Depth sits above the tile layers (max 3) and below the player (100).
const SIGN_DEPTH = 60
const BUILDING_SIGNS = {
  // Keyed by the object name you give the rectangle in the Tiled `signs` layer.
  //   clip  — looping muted video texture (most lively); falls back to image
  //   image — still PNG (used when there's no clip)
  //   video — makes the sign clickable → opens a YouTube popup over the canvas
  //   scale — shrink the fitted result (1 = fill the box, 0.5 = half size)
  odt: { clip: 'odt', video: 'V3-fmhxeDzM', start: 179, scale: 1.1 },
}
// Sign content sources. Images are name -> URL. Clips carry their intrinsic
// pixel size so we can scale them correctly without waiting on the video
// element to report dimensions (which races with the texture swap). Reference
// a key from a BUILDING_SIGNS entry via `image:`/`clip:`.
const SIGN_IMAGES = {}
const SIGN_CLIPS = {
  odt: { url: '/maps/signs/odt.mp4', width: 1014, height: 576 },
}

export default class TiledMapScene extends Phaser.Scene {
  constructor() {
    super('TiledMap')
    this.blocked = null // Set<"col,row">
    this.cols = 0
    this.rows = 0
    this.playerTile = { x: 0, y: 0 }
    this.facing = 'down'
    this.moving = false
    this.collisionGfx = null
    this.showCollisions = false
    this.manifest = null
    this.dir = null // per-direction { animKey, idleFrame, flipX } lookup
    this.occluders = [] // [{ left, top, right, bottom }] vehicles to y-sort behind
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_URL)
    for (const name of TILESETS) {
      this.load.image(name, `/maps/tilesets/${name}.png`)
    }
    this.manifest = this.registry.get('characterManifest')
    const src = this.manifest ? resolveSheetSrc(this.manifest) : ''
    if (src) this.load.image(SHEET_KEY, src)

    for (const [key, url] of Object.entries(SIGN_IMAGES)) {
      this.load.image(`sign.${key}`, url)
    }
    for (const [key, clip] of Object.entries(SIGN_CLIPS)) {
      this.load.video(`clip.${key}`, clip.url, true) // noAudio: muted billboard
    }
  }

  create() {
    const map = this.make.tilemap({ key: MAP_KEY })
    this.cols = map.width
    this.rows = map.height

    const tilesets = TILESETS.map((name) => map.addTilesetImage(name, name))

    let depth = 0
    for (const name of LAYER_NAMES) {
      const layer = map.createLayer(name, tilesets, 0, 0)
      if (layer) layer.setDepth(depth++)
    }

    const worldW = this.cols * TILE
    const worldH = this.rows * TILE
    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.cameras.main.setBackgroundColor('#1b1b22')

    // --- collisions: rasterize the object group onto the tile grid ------
    const objLayer = map.getObjectLayer('collisions')
    this.blocked = rasterizeCollisions(objLayer?.objects ?? [], this.cols, this.rows, TILE)

    // Vehicles (named collision objects) double as y-sort occluders.
    this.occluders = (objLayer?.objects ?? [])
      .filter((o) => OCCLUDER_NAMES.has(o.name) && o.width && o.height)
      .map((o) => ({ left: o.x, top: o.y, right: o.x + o.width, bottom: o.y + o.height }))

    // Collision overlay (toggle with C) — drawn above tiles, below player.
    const gfx = this.add.graphics().setDepth(50)
    gfx.fillStyle(0xff3b3b, 0.38)
    gfx.lineStyle(1, 0xff3b3b, 0.7)
    for (const cell of this.blocked) {
      const [cx, cy] = cell.split(',').map(Number)
      gfx.fillRect(cx * TILE, cy * TILE, TILE, TILE)
      gfx.strokeRect(cx * TILE + 0.5, cy * TILE + 0.5, TILE - 1, TILE - 1)
    }
    gfx.setVisible(false)
    this.collisionGfx = gfx

    // --- building overlays: text panels / images, placed on the rectangles
    // you draw in the Tiled `signs` object layer (content keyed by name) ------
    const signLayer = map.getObjectLayer('signs')
    this.addBuildingSigns(signLayer?.objects ?? [])

    // --- player: build from the manifest, spawn near map centre ---------
    this.setupCharacter()

    const spawn = this.findSpawn()
    this.playerTile = { ...spawn }
    const render = this.manifest?.render || { originX: 0.5, originY: 1, scale: 1 }
    const sheetReady = this.textures.exists(SHEET_KEY)
    // Origin at bottom-centre so a tall figure stands on its tile with the
    // body overflowing upward — the tile-RPG convention.
    this.player = sheetReady
      ? this.add.sprite(0, 0, SHEET_KEY, this.dir.down.idleFrame)
      : this.add.rectangle(0, 0, TILE * 0.7, TILE * 0.7, 0x2e7dff).setStrokeStyle(2, 0xffffff)
    this.player
      .setOrigin(render.originX, render.originY)
      .setDepth(PLAYER_FRONT_DEPTH)
    if (render.scale && render.scale !== 1) this.player.setScale(render.scale)
    this.placePlayer(spawn.x, spawn.y)
    this.updatePlayerDepth()
    this.applyFacing('down', false)
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18)

    // --- input ----------------------------------------------------------
    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    })
    this.input.keyboard.on('keydown-C', () => {
      this.showCollisions = !this.showCollisions
      this.collisionGfx.setVisible(this.showCollisions)
    })

    this.addHud(map)
  }

  update() {
    if (this.moving) return
    const dir = this.heldDirection()
    if (dir) this.step(dir)
  }

  heldDirection() {
    const c = this.cursors
    const w = this.wasd
    if (c.left.isDown || w.left.isDown) return 'left'
    if (c.right.isDown || w.right.isDown) return 'right'
    if (c.up.isDown || w.up.isDown) return 'up'
    if (c.down.isDown || w.down.isDown) return 'down'
    return null
  }

  step(dir) {
    this.facing = dir
    this.applyFacing(dir, true)

    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
    const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
    const tx = this.playerTile.x + dx
    const ty = this.playerTile.y + dy
    if (!this.walkable(tx, ty)) {
      this.applyFacing(dir, false) // bumped a wall / edge — face it, stand still
      return
    }

    this.moving = true
    this.playerTile = { x: tx, y: ty }
    this.updatePlayerDepth() // re-sort against vehicles for the destination tile
    const dest = this.tilePos(tx, ty) // bottom-anchored origin → feet on the tile
    this.tweens.add({
      targets: this.player,
      x: dest.x,
      y: dest.y,
      duration: STEP_MS,
      ease: 'Linear',
      onComplete: () => {
        this.moving = false
        if (!this.heldDirection()) this.applyFacing(this.facing, false)
      },
    })
  }

  // Point the sprite the right way using the per-direction lookup built in
  // setupCharacter(). `walking` plays that direction's loop (if it has one);
  // otherwise we snap to its idle frame. Directions with no own frames were
  // resolved to the down posture (flipped, for left) back in setup.
  applyFacing(dir, walking) {
    if (!this.player || !this.player.anims) return // rectangle fallback, no sheet
    const cfg = this.dir[dir]
    if (!cfg) return
    if (walking && cfg.animKey) {
      this.player.setFlipX(cfg.walkFlip)
      this.player.anims.play(cfg.animKey, true)
    } else {
      this.player.anims.stop()
      if (cfg.idleFrame) {
        this.player.setFlipX(cfg.idleFlip)
        this.player.setFrame(cfg.idleFrame)
      }
    }
  }

  // Register the manifest's frame rects as named frames on one sheet texture,
  // build a looping anim per walk posture, and precompute a per-direction
  // { animKey, idleFrame, flip } lookup (with idle→walk and dir→down fallbacks).
  setupCharacter() {
    this.dir = { down: {}, up: {}, left: {}, right: {} }
    const m = this.manifest
    if (!m || !this.textures.exists(SHEET_KEY)) {
      for (const d of Object.keys(this.dir)) {
        this.dir[d] = { animKey: null, idleFrame: null, walkFlip: false, idleFlip: false }
      }
      return
    }

    const tex = this.textures.get(SHEET_KEY)
    for (const slot of POSTURE_KEYS) {
      ;(m.postures?.[slot] || []).forEach((r, i) => {
        const name = `${slot}.${i}`
        if (!tex.has(name)) tex.add(name, 0, r.x, r.y, r.w, r.h)
      })
    }

    const frameRate = m.frameRate || 9
    for (const slot of POSTURE_KEYS) {
      if (!slot.startsWith('walk')) continue
      const rects = m.postures?.[slot] || []
      if (!rects.length) continue
      const key = `anim.${slot}`
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: rects.map((_, i) => ({ key: SHEET_KEY, frame: `${slot}.${i}` })),
          frameRate,
          repeat: -1,
        })
      }
    }

    for (const d of Object.keys(this.dir)) {
      const walk = framesForFacing(m, d, 'walk')
      const idle = framesForFacing(m, d, 'idle')
      let idleFrame = null
      let idleFlip = idle.flipX
      if (idle.frames.length) {
        idleFrame = `${idle.slot}.0`
      } else if (walk.frames.length) {
        idleFrame = `${walk.slot}.0`
        idleFlip = walk.flipX
      }
      this.dir[d] = {
        animKey: walk.frames.length ? `anim.${walk.slot}` : null,
        walkFlip: walk.flipX,
        idleFrame,
        idleFlip,
      }
    }
  }

  // Sprite position for a tile: centred horizontally, feet on the tile's
  // bottom edge (matches the bottom-centre origin convention).
  tilePos(x, y) {
    return { x: x * TILE + TILE / 2, y: y * TILE + TILE }
  }

  placePlayer(x, y) {
    const p = this.tilePos(x, y)
    this.player.setPosition(p.x, p.y)
  }

  // Y-sort the player against vehicle occluders. When its feet are above an
  // occluder's bottom edge (and it horizontally overlaps), it's "behind" the
  // vehicle → draw under the props layer; otherwise keep it on top. The upper
  // bound (top − 1.5 tiles) means only a near-overlap counts, so a player far
  // to the north isn't needlessly sunk behind unrelated props.
  updatePlayerDepth() {
    if (!this.player) return
    const cx = this.playerTile.x * TILE + TILE / 2
    const feetY = (this.playerTile.y + 1) * TILE
    const behind = this.occluders.some(
      (o) =>
        cx >= o.left &&
        cx <= o.right &&
        feetY <= o.bottom &&
        feetY >= o.top - TILE * 1.5,
    )
    this.player.setDepth(behind ? PLAYER_BEHIND_DEPTH : PLAYER_FRONT_DEPTH)
  }

  // Stamp overlays onto the rectangles drawn in the Tiled `signs` layer. The
  // rectangle is the anchor *space*; its name selects the content from the
  // BUILDING_SIGNS config. An image is fitted into the box; otherwise we draw
  // a text-on-panel sign sized to the box. All created at runtime.
  addBuildingSigns(objects) {
    for (const obj of objects) {
      const cfg = BUILDING_SIGNS[obj.name]
      if (!cfg) continue
      const a = anchorRect(obj) // { cx, cy, w, h } — w/h are the drawn box

      let go
      if (cfg.clip) {
        go = this.addClip(a, cfg)
      } else if (cfg.image) {
        const key = `sign.${cfg.image}`
        if (!this.textures.exists(key)) continue
        go = this.add.image(a.cx, a.cy, key).setOrigin(0.5).setDepth(SIGN_DEPTH)
        if (a.w && a.h) go.setScale(Math.min(a.w / go.width, a.h / go.height))
      } else {
        go = this.addSign(a, cfg)
      }
      if (cfg.video && go) this.makeVideoTrigger(go, cfg)
    }
  }

  // Make a sign clickable → open the YouTube popup. Player keyboard is
  // disabled while the modal is up so arrow keys don't drive the hidden
  // player behind it. Works for both image sprites and text-sign containers.
  makeVideoTrigger(go, cfg) {
    if (go.type === 'Container') {
      const w = go.width || 1
      const h = go.height || 1
      go.setInteractive(
        new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
        Phaser.Geom.Rectangle.Contains,
      )
    } else {
      go.setInteractive({ useHandCursor: true })
    }
    go.on('pointerover', () => {
      go.setAlpha(0.85)
      this.input.setDefaultCursor('pointer')
    })
    go.on('pointerout', () => {
      go.setAlpha(1)
      this.input.setDefaultCursor('default')
    })
    go.on('pointerdown', () => {
      this.input.keyboard.enabled = false
      this.input.setDefaultCursor('default')
      openVideoModal({
        videoId: cfg.video,
        start: cfg.start ?? 0,
        title: cfg.text || cfg.video,
        onClose: () => {
          this.input.keyboard.enabled = true
        },
      })
    })
  }

  // A looping muted video texture fitted into the drawn box — a "moving
  // billboard". Falls back to a text sign if the clip didn't load.
  addClip(a, cfg) {
    const key = `clip.${cfg.clip}`
    const meta = SIGN_CLIPS[cfg.clip]
    if (!this.cache.video.exists(key) || !meta) {
      return this.addSign(a, { ...cfg, text: cfg.text || cfg.clip })
    }
    const vid = this.add.video(a.cx, a.cy, key).setOrigin(0.5).setDepth(SIGN_DEPTH)
    vid.setMute(true) // muted → allowed to autoplay without a user gesture

    // Scale = box-fit × optional shrink. Computed from the clip's KNOWN size so
    // it's stable regardless of when the video texture swaps in (reading the
    // element's size at runtime raced with that and locked a wrong scale).
    // display = scaleX × frameWidth, and the frame settles to meta.width, so
    // this yields the intended on-screen size once the first frame decodes.
    if (a.w && a.h) {
      const boxFit = Math.min(a.w / meta.width, a.h / meta.height)
      vid.setScale(boxFit * (cfg.scale ?? 1))
    }
    vid.play(true) // loop
    return vid
  }

  // The "blank space + text" sign: a filled rounded-rect panel and a centred
  // label, grouped in a Container. The panel takes the drawn box's size (so a
  // bigger rectangle = a bigger sign), and the text scales down to fit inside
  // it. With no box (a point object) the panel just hugs the text.
  addSign(a, cfg) {
    const label = this.add
      .text(0, 0, cfg.text, {
        fontFamily: 'monospace',
        fontSize: `${cfg.fontSize ?? 10}px`,
        color: cfg.color ?? '#2c1d10',
        align: 'center',
        resolution: 2, // keep small text crisp under pixelArt scaling
      })
      .setOrigin(0.5)

    const padX = 5
    const padY = 3
    const w = a.w || Math.ceil(label.width) + padX * 2
    const h = a.h || Math.ceil(label.height) + padY * 2
    // Shrink the text to fit the box (never enlarge past the authored size).
    const fit = Math.min((w - padX * 2) / label.width, (h - padY * 2) / label.height, 1)
    if (fit < 1) label.setScale(fit)

    const panel = this.add.graphics()
    panel.fillStyle(cfg.bg ?? 0xf3e6bb, cfg.bgAlpha ?? 1)
    panel.lineStyle(1, cfg.border ?? 0x2c1d10, 1)
    panel.fillRoundedRect(-w / 2, -h / 2, w, h, 3)
    panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 3)

    return this.add.container(a.cx, a.cy, [panel, label]).setDepth(SIGN_DEPTH).setSize(w, h)
  }

  walkable(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false
    return !this.blocked.has(`${x},${y}`)
  }

  // First non-blocked tile scanning outward from the map centre.
  findSpawn() {
    const cx = Math.floor(this.cols / 2)
    const cy = Math.floor(this.rows / 2)
    for (let r = 0; r < Math.max(this.cols, this.rows); r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (this.walkable(x, y)) return { x, y }
        }
      }
    }
    return { x: 0, y: 0 }
  }

  addHud(map) {
    const lines = [
      `downtown.tmx  ·  ${this.cols}×${this.rows} @ ${TILE}px  ·  ${map.tilesets.length} tilesets`,
      'Arrows / WASD: move    C: toggle collisions',
    ]
    const hud = this.add
      .text(8, 8, lines, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { x: 8, y: 6 },
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(1000)
    hud.setShadow(1, 1, '#000', 2)
  }
}

// Centre + size of a Tiled object's footprint in world pixels. Rectangles use
// their box; a polygon uses its bounding box (points are relative to x,y).
function anchorRect(o) {
  if (o.polygon && o.polygon.length) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of o.polygon) {
      const px = o.x + p.x
      const py = o.y + p.y
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }
  }
  const w = o.width || 0
  const h = o.height || 0
  return { cx: o.x + w / 2, cy: o.y + h / 2, w, h }
}

// Rasterize Tiled collision objects (rectangles + a polygon; points are
// markers and ignored) into a Set of "col,row" blocked-tile keys. A cell
// blocks when its centre lies inside a shape — the standard tile-RPG rule.
function rasterizeCollisions(objects, cols, rows, tile) {
  const blocked = new Set()
  const rects = []
  const polys = []
  for (const o of objects) {
    if (o.point) continue
    if (o.polygon && o.polygon.length) {
      polys.push(o.polygon.map((p) => ({ x: o.x + p.x, y: o.y + p.y })))
    } else if (o.width > 0 && o.height > 0) {
      rects.push({ x: o.x, y: o.y, w: o.width, h: o.height })
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * tile + tile / 2
      const py = row * tile + tile / 2
      const hit =
        rects.some((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) ||
        polys.some((poly) => pointInPolygon(px, py, poly))
      if (hit) blocked.add(`${col},${row}`)
    }
  }
  return blocked
}

function pointInPolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
