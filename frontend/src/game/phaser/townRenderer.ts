// Town presentation (R4). Everything that paints the town lives here: the
// producer-baked ground blit (#171 — no autotile resolution at runtime,
// ADR-0003), building sprites + nameplates, tall props, plus the dev-only
// layer inspector and tile grid. The scene stays an orchestrator — it calls
// preloadAssets() in preload(), render() in create() to lay the world down,
// and setupDevTools() once the test API is up.
//
// Phaser-coupled by design (it owns the `scene.add.*` calls), so it takes the
// live scene and reads/writes the same `scene.*` fields the scene used to own
// (buildings, propCells, devLayers, …). The pure column-count helper
// (tilesetColumns) is exported for unit tests.

import { TILE } from '../constants.js'
import { buildingOverlayDepth } from '../town.js'
import { townPropDraws } from '../townProps.ts'
import { loadObjectTextures, stampEntity } from '../../kernel/entityLoader.ts'
import { bakedTextureKey, groundDrawList } from '../../kernel/mapRenderer.ts'
import { buildingKeyFor, DEFAULT_BUILDING } from '../buildings.js'
import { preloadCharacter } from './characterRig.js'
import { GATE_TRAINER } from '../encounters.js'

// The Phaser scene, structurally. We touch only a handful of its fields; typing
// the full Phaser surface here buys nothing, so the scene stays loose.
type Scene = any

// Dev-only layer inspector (press L for a panel, number keys to toggle each
// layer; also window.__game.layers in the console). import.meta.env.DEV is
// statically false in production builds, so Vite strips all of this. The first
// three are the ground terrain layers (road/dirt base + the merged grass layer,
// fill/edges/corners together); the last three are depth-sorted sprite groups
// (trees/buildings/trainer aren't a single layer, but toggling their visibility
// works the same regardless of depth).
const DEV = import.meta.env.DEV
const DEV_LAYERS = [
  { key: 'roadBase', label: 'Road base' },
  { key: 'dirtBase', label: 'Dirt base' },
  { key: 'grass', label: 'Grass' },
  { key: 'trees', label: 'Trees / props' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'npc', label: 'NPCs (trainer)' },
]
// Phaser keyboard event names for the digit keys 1..8.
const DEV_NUM_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT']

// ---- preload -------------------------------------------------------------

// Load every texture the town renders: player walk frames, the active manifest
// sheet, building roof/body pairs, the gate trainer, foliage art (tree + flower
// objects, plus the bundled fallback), and the ground-tile spritesheets. Stashes
// the manifest / ground catalog on the scene so create() + render() read it back.
export function preloadAssets(scene: Scene) {
  const reg = scene.registry.get('assets') || {}

  // Player walks: 4-frame strip per direction. The DOM engine loads each
  // PNG separately; here we keep them as individual textures and look up
  // by direction + step index.
  const player = reg.player || {}
  for (const dir of ['up', 'down', 'left', 'right']) {
    const frames = player[dir] || []
    frames.forEach((url: string, i: number) => {
      scene.load.image(`player.${dir}.${i}`, url)
    })
  }

  // Active character manifest (sprite-mapper). When present, its sheet drives
  // the player; the bundled frames above remain the fallback. The rig (frame
  // slicing + walk anims) is built in create() via setupCharacter().
  scene._charManifest = preloadCharacter(scene)

  // reg.buildings is a map of key → { roofUrl, bodyUrl }. Load every one
  // as `building.<key>.roof` / `.body`; addBuildingSprite picks per plot.
  for (const [key, art] of Object.entries<any>(reg.buildings || {})) {
    if (art.roofUrl) scene.load.image(`building.${key}.roof`, art.roofUrl)
    if (art.bodyUrl) scene.load.image(`building.${key}.body`, art.bodyUrl)
  }

  // Gate trainer + opponent sprites. `encounters.js` already imports
  // these as Vite-resolved URLs; we just reuse them so the engines
  // share one source of truth for the opponent table.
  scene.load.image('trainer.boss-k', GATE_TRAINER.sprite)

  // Foliage art (trees + the '*' flower scatter) flows through the shared
  // entity loader (ADR-0008): the Hometown Policy's active objects (#173) are
  // references resolved to `obj.<id>` textures, exactly as the authored map
  // loads its placed props. A kind with no active object places nothing —
  // there is no bundled fallback art.
  const policy = scene.registry.get('hometownPolicy') || {}
  loadObjectTextures(
    scene,
    [policy.tree, policy.flowerGroup, policy.flowerSingle].filter((o) => o?.image),
  )

  // Admin-mapped house (#29). When present it replaces the bundled roof/body
  // stack on every plot (addBuildingSprite); absent → the bundled art.
  scene._buildingObject = scene.registry.get('buildingObject') || null
  if (scene._buildingObject?.image) scene.load.image('building.mapped', scene._buildingObject.image)
  // Foreground / in-front mask (#36): the alpha bitmap that clips the overlay
  // copy of the house drawn above the avatar's on-building depth band.
  if (scene._buildingObject?.fg_mask) scene.load.image('building.fgmask', scene._buildingObject.fg_mask)

  // Ground-tile catalog (ground-tile mapper). Each referenced tileset loads
  // once as a uniform spritesheet (frame = cell) under the SAME `bake.<name>`
  // key the authored-map renderer uses, because the town's ground is now baked
  // in the producer and blitted through the same draw path (#171).
  scene._groundTiles = scene.registry.get('groundTiles') || []
  const seenSheets = new Set<string>()
  for (const t of scene._groundTiles) {
    const key = bakedTextureKey(t.tileset)
    if (seenSheets.has(key)) continue
    seenSheets.add(key)
    scene.load.spritesheet(key, `/maps/tilesets/${t.tileset}.png`, {
      frameWidth: t.cell,
      frameHeight: t.cell,
    })
  }
}

// Column count of every loaded ground sheet (frame = row * cols + col), read
// off the texture exactly as the map editor reads the PNG — the one piece of
// catalog data only known once images exist. Feeds catalogFromGroundTiles.
export function tilesetColumns(scene: Scene): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of scene._groundTiles || []) {
    if (out[t.tileset] || !scene.textures.exists(bakedTextureKey(t.tileset))) continue
    const width = scene.textures.get(bakedTextureKey(t.tileset)).getSourceImage().width
    out[t.tileset] = Math.max(1, Math.floor(width / t.cell))
  }
  return out
}

// ---- render --------------------------------------------------------------

// Lay the static town down: ground layers, tall props, and buildings. The
// scene calls this once in create(); the returned building list is the data
// spawnPlayer + walkable depend on, so render assigns it onto the scene.
export function render(scene: Scene) {
  // Dev layer inspector — bucket each sprite so it can be toggled (see
  // setupDevTools, called after the test API is up). Stripped in prod.
  if (DEV) {
    scene.devLayers = {}
    scene.layerVisible = {}
    for (const l of DEV_LAYERS) {
      scene.devLayers[l.key] = []
      scene.layerVisible[l.key] = true
    }
  }

  // Ground: blit the producer-baked cells exactly as mapRenderer blits an
  // authored map (#171, ADR-0003) — every stamp was resolved in the bake, so
  // there is no autotile logic here. A baked depth is its terrain's stack
  // index × 0.1, so the catalog stack maps each stamp back to a dev-inspector
  // bucket; terrains without a bucket (e.g. water) just aren't toggleable.
  const stack: string[] = scene._groundStack || []
  const bucketForDepth = (depth: number) => {
    const terrain = stack[Math.round(depth * 10)]
    return terrain === 'grass' ? 'grass' : `${terrain}Base`
  }
  for (const d of groundDrawList(scene.town.ground)) {
    const img = stampEntity(scene, d)
    if (DEV && img) scene.devLayers[bucketForDepth(d.depth)]?.push(img)
  }

  // Non-terrain chars (the signpost) keep their procedural texture, drawn one
  // step above the topmost ground layer; the grass beneath is in the bake.
  const signDepth = stack.length * 0.1 || 0.3
  for (let y = 0; y < scene.town.rows; y++) {
    for (let x = 0; x < scene.town.cols; x++) {
      if (scene.town.map[y][x] !== 's') continue
      const img = scene.add.image(x * TILE, y * TILE, 'tile.sign').setOrigin(0, 0).setDepth(signDepth)
      if (DEV) scene.devLayers?.grass?.push(img)
    }
  }

  // Foliage — boundary trees (bottom-anchored, y-sorted) and the flower scatter
  // (a flat overlay). Both resolve to shared-loader draws and stamp through the
  // one kernel entity path the authored map uses (ADR-0008 / #141).
  addProps(scene)

  // Buildings — placement sorted by position_order, dropped onto the
  // town's plots in turn. Same shape as buildBuildings() in VillageGame.
  const communities = scene.registry.get('communities') || []
  const sorted = [...communities].sort((a, b) => a.position_order - b.position_order)
  scene.buildings = sorted.map((community, i) => {
    const plot = scene.town.plots[i]
    const sprite = addBuildingSprite(scene, community, plot)
    return { community, ...plot, sprite }
  })
}

// Build the two-layer building sprite. We don't yet hue-rotate from
// the community color — Phaser tint is RGB-only and a per-roof
// hue-rotate would need a custom shader. PR-B accepts a uniform roof
// color for now; PR-C+ adds the shader / palette-swap.
function addBuildingSprite(scene: Scene, community: any, plot: any) {
  const cx = plot.col * TILE
  const cy = plot.row * TILE
  const w = plot.w * TILE
  const h = plot.h * TILE
  const depth = (plot.row + plot.h) * 10 - 1

  // Nameplate under the building — shared by both the mapped and bundled art.
  const addPlate = () =>
    scene.add
      .text(cx + w / 2, cy + h - 4, community.title.toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#2c1d10',
        backgroundColor: '#f3e6bb',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 0)
      .setDepth(depth + 2)

  // Admin-mapped house (#29): one baked sprite filling the plot, replacing the
  // roof/body stack + per-community tint. The door anchor it carries is honoured
  // in town.ts (buildTown), so walkability/entry/depth already line up.
  if (scene._buildingObject?.image && scene.textures.exists('building.mapped')) {
    const house = scene.add.image(cx, cy, 'building.mapped').setOrigin(0, 0).setDisplaySize(w, h).setDepth(depth)
    const nameplate = addPlate()
    if (DEV) scene.devLayers?.buildings?.push(house, nameplate)

    // Foreground overlay (#36): a second copy of the house, clipped to the
    // fg-mask alpha and drawn just above the building's south band so the masked
    // foliage covers the avatar on the building — but the avatar's own depth
    // beats it once south of the footprint (see buildingOverlayDepth). Phaser 4
    // dropped BitmapMask, so we use an internal Mask filter, which multiplies the
    // overlay's alpha by the mask texture's (matched to the overlay's bounds; the
    // mask shares the house art's layout). Filters are WebGL-only — on the Canvas
    // renderer we drop the overlay and fall back to today's single-depth house.
    if (scene._buildingObject.fg_mask && scene.textures.exists('building.fgmask')) {
      const overlay = scene.add
        .image(cx, cy, 'building.mapped')
        .setOrigin(0, 0)
        .setDisplaySize(w, h)
        .setDepth(buildingOverlayDepth(plot))
      overlay.enableFilters()
      if (overlay.filters) {
        overlay.filters.internal.addMask('building.fgmask')
        if (DEV) scene.devLayers?.buildings?.push(overlay)
      } else {
        overlay.destroy()
      }
    }
    return house
  }

  // Which art to use. Falls back to the default if the chosen key never
  // loaded (e.g. a community.building naming art that isn't present).
  let key = buildingKeyFor(community)
  if (!scene.textures.exists(`building.${key}.roof`)) key = DEFAULT_BUILDING

  // Roof — top 36% of the footprint.
  const roof = scene.add
    .image(cx, cy, `building.${key}.roof`)
    .setOrigin(0, 0)
    .setDisplaySize(w, h * 0.36)
    .setDepth(depth)

  // Body — bottom 64%.
  const body = scene.add
    .image(cx, cy + h * 0.36, `building.${key}.body`)
    .setOrigin(0, 0)
    .setDisplaySize(w, h * 0.64)
    .setDepth(depth)

  const plate = addPlate()

  if (DEV) scene.devLayers?.buildings?.push(roof, body, plate)

  // Approximate per-community tint by tinting the roof — until we have
  // a hue-rotate shader, this is the cheapest way to differentiate
  // houses visually.
  if (community.color) {
    const hex = parseInt(community.color.replace('#', ''), 16)
    if (!Number.isNaN(hex)) roof.setTint(hex)
  }

  return roof
}

// Stamp the town's placed entities through the shared entity loader. Trees
// bucket into the 'trees' dev layer, flowers into 'grass' (matching the
// pre-#141 split). No tree today marks `blocks`, so propCells stays empty —
// boundary trees sit on already-blocked 'T' tiles; the field is cleared so the
// walkability rule keeps seeing an empty dynamic-blocker set from props.
function addProps(scene: Scene) {
  scene.propCells.clear()
  const policy = scene.registry.get('hometownPolicy') || { tree: null, flowerGroup: null, flowerSingle: null }
  const { trees, flowers } = townPropDraws(scene.town.entities, policy)
  for (const d of trees) {
    const sprite = stampEntity(scene, d)
    if (DEV && sprite) scene.devLayers?.trees?.push(sprite)
  }
  for (const d of flowers) {
    const sprite = stampEntity(scene, d)
    if (DEV && sprite) scene.devLayers?.grass?.push(sprite)
  }
}

// ---- dev-only tools (grid overlay + ground-layer inspector) --------------
// Wired in create() after the test API is up, so the inspector can hang off
// window.__game. The whole block is gated by DEV and stripped in prod.
export function setupDevTools(scene: Scene) {
  if (!DEV) return
  setupGrid(scene)
  setupDevLayers(scene)
}

// Tile-grid overlay (dev-only authoring aid) — toggle with G. Drawn above
// everything so tile boundaries are visible over ground, buildings, and props.
// G also reveals A1 coordinate labels, built lazily on first show.
function setupGrid(scene: Scene) {
  const worldW = scene.town.cols * TILE
  const worldH = scene.town.rows * TILE
  const grid = scene.add.graphics().setDepth(9000)
  grid.lineStyle(1, 0xffffff, 0.22)
  for (let x = 0; x <= scene.town.cols; x++) grid.lineBetween(x * TILE, 0, x * TILE, worldH)
  for (let y = 0; y <= scene.town.rows; y++) grid.lineBetween(0, y * TILE, worldW, y * TILE)
  grid.setVisible(false)
  scene.gridGfx = grid
  scene.showGrid = false

  scene.input.keyboard.on('keydown-G', () => {
    scene.showGrid = !scene.showGrid
    scene.gridGfx.setVisible(scene.showGrid)
    if (scene.showGrid && !scene.gridLabels) buildGridLabels(scene)
    scene.gridLabels?.setVisible(scene.showGrid)
  })
}

// A counterpart to the G grid: press L for a legend panel, 1–5 to toggle each
// ground layer; also exposed as window.__game.layers for the console.
function setupDevLayers(scene: Scene) {
  const panel = scene.add
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
  scene.devLayerPanel = panel
  scene.showLayerPanel = false
  refreshDevLayerPanel(scene)

  scene.input.keyboard.on('keydown-L', () => {
    scene.showLayerPanel = !scene.showLayerPanel
    panel.setVisible(scene.showLayerPanel)
  })
  DEV_LAYERS.forEach((l, i) => {
    scene.input.keyboard.on(`keydown-${DEV_NUM_KEYS[i]}`, () => toggleDevLayer(scene, l.key))
  })

  const w = typeof window !== 'undefined' ? (window as any) : null
  if (w && w.__game) {
    w.__game.layers = {
      list: () => DEV_LAYERS.map((l) => ({ ...l, visible: scene.layerVisible[l.key] })),
      toggle: (key: string) => toggleDevLayer(scene, key),
      show: (key: string) => setDevLayer(scene, key, true),
      hide: (key: string) => setDevLayer(scene, key, false),
    }
  }
  // eslint-disable-next-line no-console
  console.log('[dev] ground layers: L = panel, 1–5 toggle, or window.__game.layers')
}

function toggleDevLayer(scene: Scene, key: string) {
  setDevLayer(scene, key, !scene.layerVisible[key])
}

function setDevLayer(scene: Scene, key: string, visible: boolean) {
  const bucket = scene.devLayers?.[key]
  if (!bucket) return
  scene.layerVisible[key] = visible
  for (const s of bucket) s.setVisible(visible)
  refreshDevLayerPanel(scene)
}

// Build the per-cell coordinate labels for the G grid (A1 notation: column
// letters across, 1-based row numbers down — top-left cell is A1). Kept in a
// container so the G handler can toggle them all with one setVisible.
function buildGridLabels(scene: Scene) {
  const c = scene.add.container(0, 0).setDepth(9001)
  for (let y = 0; y < scene.town.rows; y++) {
    for (let x = 0; x < scene.town.cols; x++) {
      const label = scene.add
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
  scene.gridLabels = c
}

function refreshDevLayerPanel(scene: Scene) {
  if (!scene.devLayerPanel) return
  const lines = ['GROUND LAYERS  (L)']
  DEV_LAYERS.forEach((l, i) => {
    const on = scene.layerVisible[l.key]
    const count = scene.devLayers[l.key].length
    lines.push(`${i + 1} [${on ? '×' : ' '}] ${l.label}  (${count})`)
  })
  scene.devLayerPanel.setText(lines.join('\n'))
}

// Spreadsheet-style column label for a 0-based column index: 0→A, 25→Z,
// 26→AA, … (rolls to two letters for maps wider than 26 cells).
function colLabel(n: number) {
  let s = ''
  let i = n + 1 // 1-based for the modulo math
  while (i > 0) {
    const r = (i - 1) % 26
    s = String.fromCharCode(65 + r) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}
