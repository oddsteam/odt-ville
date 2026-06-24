// Town presentation (R4). Everything that paints the town lives here: ground
// layers (road/dirt/grass fill + autotiled edges), building sprites + name-
// plates, tall props, plus the dev-only layer inspector and tile grid. The
// scene stays an orchestrator — it calls preloadAssets() in preload(),
// render() in create() to lay the world down, and setupDevTools() once the
// test API is up.
//
// Phaser-coupled by design (it owns the `scene.add.*` calls), so it takes the
// live scene and reads/writes the same `scene.*` fields the scene used to own
// (groundTiles, buildings, propCells, devLayers, …). The pure frame-index
// helpers (buildGroundTileMap / buildEdgeMap) are exported for unit tests.

import { TILE } from '../constants.js'
import { buildingKeyFor, DEFAULT_BUILDING } from '../buildings.js'
import { ENABLED as TILESET_ENABLED, PROPS, tallPropsFor } from './townTileset.js'
import { preloadCharacter } from './characterRig.js'
import { GATE_TRAINER } from '../encounters.js'
import {
  GROUND_STACK,
  EDGE_CORNERS,
  coverageTerrainForCell,
  dirtLayerBorders,
  dirtLayerCoversCell,
  groundPaintStackForCell,
  roadLayerCoversCell,
  terrainBorders,
  typeForTileChar,
} from './groundModel.js'

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
// sheet, building roof/body pairs, the gate trainer, tall-prop art, and the
// ground-tile spritesheets. Stashes the manifest / tree object / ground catalog
// on the scene so create() + render() can read them back.
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

  // Tall-prop art for the overlay pass. An admin-defined tree object
  // (tile-object mapper → registry) wins; otherwise the bundled tree art
  // from townTileset.js is used.
  scene._treeObject = scene.registry.get('treeObject') || null
  if (scene._treeObject?.image) {
    scene.load.image('prop.tree', scene._treeObject.image)
  } else if (TILESET_ENABLED) {
    for (const prop of Object.values<any>(PROPS)) scene.load.image(prop.key, prop.url)
  }

  // Admin flower art (tile-object mapper, kind 'prop') — when present it
  // replaces the procedural flower buds at every '*' cell (issue #26). Absent
  // (no active object) → the procedural tile.flower buds are used.
  scene._propObject = scene.registry.get('propObject') || null
  if (scene._propObject?.image) scene.load.image('prop.flower', scene._propObject.image)

  // Ground-tile catalog (ground-tile mapper). Each referenced tileset loads
  // once as a uniform spritesheet (frame = cell), so create() can stamp a
  // specific cell — grass/dirt/road — onto the map by frame index.
  scene._groundTiles = scene.registry.get('groundTiles') || []
  const seenSheets = new Set<string>()
  for (const t of scene._groundTiles) {
    const key = `gtset.${t.tileset}`
    if (seenSheets.has(key)) continue
    seenSheets.add(key)
    scene.load.spritesheet(key, `/maps/tilesets/${t.tileset}.png`, {
      frameWidth: t.cell,
      frameHeight: t.cell,
    })
  }
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

  // Ground is rendered at fixed road → dirt → grass depths. The higher layer
  // owns each seam and reveals a targeted lower-layer fill beneath its edge.
  // Fill + edge cells come from the ground-tile mapper; unknowns (the sign)
  // fall back to the procedural textures.
  scene.groundTiles = buildGroundTileMap(scene)
  paintGround(scene)

  // Tall props (trees) — bottom-anchored sprites that overflow their tile
  // and y-sort against the player. Runs if either the bundled art or an
  // admin tree object is available.
  if (TILESET_ENABLED || scene._treeObject?.image) addTallProps(scene)

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

// Resolve the ground-tile catalog into a `tileChar -> { key, frame }` lookup
// for the ground layer. Surface types map onto the town's map chars:
//   grass -> '.' open ground AND '*' flower patches (same grass cell)
//   dirt  -> 'g' tall-grass encounter field
//   road  -> ':' streets, side avenue, entrance stem
// The spritesheet was loaded in preload(); the cell's frame index is
// row * columns + col, with columns derived from the loaded image width.
export function buildGroundTileMap(scene: Scene): Record<string, { key: string; frame: number }> {
  const TYPE_TO_CHARS: Record<string, string[]> = { grass: ['.', '*'], dirt: ['g'], road: [':'] }
  const out: Record<string, { key: string; frame: number }> = {}
  for (const t of scene._groundTiles || []) {
    // Only fill tiles paint the interior; edge tiles (role: 'edge') are
    // resolved by the boundary pass — Step 2, not yet wired here.
    if (t.role && t.role !== 'fill') continue
    const chars = TYPE_TO_CHARS[t.tile_type]
    if (!chars) continue
    const key = `gtset.${t.tileset}`
    if (!scene.textures.exists(key)) continue
    const width = scene.textures.get(key).getSourceImage().width
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
export function buildEdgeMap(scene: Scene): Record<string, Record<string, { key: string; frame: number }>> {
  const out: Record<string, Record<string, { key: string; frame: number }>> = {}
  for (const t of scene._groundTiles || []) {
    if ((t.role !== 'edge' && t.role !== 'corner') || !t.side) continue
    const key = `gtset.${t.tileset}`
    if (!scene.textures.exists(key)) continue
    const cols = Math.max(1, Math.floor(scene.textures.get(key).getSourceImage().width / t.cell))
    ;(out[t.tile_type] ||= {})[t.side] = { key, frame: t.row * cols + t.col }
  }
  return out
}

// Render fixed road → dirt → grass layers. Logical terrain ownership never
// changes: the higher terrain owns each seam, and its transparent edge gets
// the highest applicable lower terrain as backing at that terrain's depth.
function paintGround(scene: Scene) {
  const fill = scene.groundTiles
  const edges = buildEdgeMap(scene)
  // Flat fill tile per terrain type (the char fill map keyed by terrain).
  const fillFor: Record<string, any> = {
    road: fill[':'] || null,
    dirt: fill.g || null,
    grass: fill['.'] || null,
  }
  // Outer corners: a diagonal tile spanning two adjacent orthogonal borders.
  const stamp = (x: number, y: number, t: any, depth: number, bucket?: string) => {
    if (!t) return
    const img = scene.add
      .image(x * TILE, y * TILE, t.key, t.frame)
      .setOrigin(0, 0)
      .setDepth(depth)
      .setDisplaySize(TILE, TILE)
    if (DEV && bucket) scene.devLayers[bucket]?.push(img)
  }
  // Dev-inspector bucket for a layer. Grass fill/edges/corners are one layer;
  // road/dirt are their base layers.
  const bucketFor = (layer: string) => (layer === 'grass' ? 'grass' : `${layer}Base`)

  // Draw a terrain's own tile at (x,y): autotiled (fill / edge / corner) when
  // the terrain has edge tiles tagged — grass today, dirt/road automatically
  // once tagged — otherwise a flat fill. Generic across every terrain.
  const drawOwn = (layer: string, x: number, y: number, depth: number, borderOverride: any = null) => {
    const e = edges[layer]
    const f = fillFor[layer]
    if (!e) {
      stamp(x, y, f, depth, bucketFor(layer))
      return
    }
    const border = borderOverride || terrainBorders(scene.town, x, y, layer)
    const used = new Set<string>()
    let drew = false
    for (const { c, a, b } of EDGE_CORNERS) {
      if (border[a] && border[b] && e[c]) {
        stamp(x, y, e[c], depth, bucketFor(layer))
        used.add(a)
        used.add(b)
        drew = true
      }
    }
    for (const d of ['N', 'E', 'S', 'W']) {
      if (border[d] && !used.has(d) && e[d]) {
        stamp(x, y, e[d], depth, bucketFor(layer))
        drew = true
      }
    }
    if (!drew) stamp(x, y, f, depth, bucketFor(layer))
  }

  // One generic pass per layer, bottom → top. Dirt also paints its autotiled
  // underlay mask beneath neighbouring grass; this never changes the logical
  // surface. Other transparent edges stamp the selected lower neighbour at
  // its canonical depth.
  GROUND_STACK.forEach((layer, i) => {
    const f = fillFor[layer]
    if (!f) return // terrain has no fill tile tagged yet
    const depth = i * 0.1
    for (let y = 0; y < scene.town.rows; y++) {
      for (let x = 0; x < scene.town.cols; x++) {
        const cType = typeForTileChar(scene.town.map[y][x])
        const roadCoverage = layer === 'road' && roadLayerCoversCell(scene.town, x, y)
        const dirtCoverage = layer === 'dirt' && dirtLayerCoversCell(scene.town, x, y)
        if (cType === layer || roadCoverage || dirtCoverage) {
          if (layer === 'road') {
            stamp(x, y, f, depth, bucketFor(layer))
            continue
          }
          if (layer === 'dirt') {
            // groundModel.js is untyped; its `= null` default params make TS
            // infer null-only, so the border/edge maps need a loose annotation.
            const dirtBorders: any = dirtLayerBorders(scene.town, x, y)
            const roadBacking = coverageTerrainForCell(scene.town, x, y, 'dirt', dirtBorders)
            if (roadBacking === 'road' && !roadLayerCoversCell(scene.town, x, y)) {
              stamp(x, y, fillFor.road, 0, bucketFor('road'))
            }
            drawOwn(layer, x, y, depth, dirtBorders)
            continue
          }
          const plan: any[] = groundPaintStackForCell(scene.town, x, y, edges as any)
          const backing = plan.find(({ role }: any) => role === 'coverage')
          const alreadyPaintedByLowerLayer =
            (backing?.terrain === 'dirt' && dirtLayerCoversCell(scene.town, x, y)) ||
            (backing?.terrain === 'road' && roadLayerCoversCell(scene.town, x, y))
          if (!alreadyPaintedByLowerLayer) {
            stamp(x, y, fillFor[backing?.terrain], backing?.depth, bucketFor(backing?.terrain))
          }
          drawOwn(layer, x, y, depth)
        }
      }
    }
  })

  // Non-terrain chars (the signpost) keep their procedural texture, drawn on
  // top of the ground layers. typeForTileChar treats 's' as grass for
  // neighbour purposes, and the grass layer already paints the cell beneath.
  for (let y = 0; y < scene.town.rows; y++) {
    for (let x = 0; x < scene.town.cols; x++) {
      if (scene.town.map[y][x] !== 's') continue
      const img = scene.add.image(x * TILE, y * TILE, 'tile.sign').setOrigin(0, 0).setDepth(0.3)
      if (DEV) scene.devLayers?.grass?.push(img)
    }
  }

  // Flowers ('*' cells from the procedural scatter, town.ts) are an overlay over
  // the grass beneath — the ground-tile mapper renders '*' identically to '.',
  // so without this pass the scatter is invisible. Above the ground fills, below
  // props/buildings/player (issue #25). The admin-saved flower object (kind
  // 'prop') replaces the procedural buds when present; sized to its footprint,
  // and kept at the flat 0.35 depth so it never draws over the player (#26).
  const flowerObj = scene._propObject?.image && scene.textures.exists('prop.flower') ? scene._propObject : null
  const flowerKey = flowerObj ? 'prop.flower' : 'tile.flower'
  const flowerW = (flowerObj?.footprint_w || 1) * TILE
  const flowerH = (flowerObj?.footprint_h || 1) * TILE
  for (let y = 0; y < scene.town.rows; y++) {
    for (let x = 0; x < scene.town.cols; x++) {
      if (scene.town.map[y][x] !== '*') continue
      const img = scene.add
        .image(x * TILE, y * TILE, flowerKey)
        .setOrigin(0, 0)
        .setDisplaySize(flowerW, flowerH)
        .setDepth(0.35)
      if (DEV) scene.devLayers?.grass?.push(img)
    }
  }
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

  // Which art to use. Falls back to the default if the chosen key never
  // loaded (e.g. a community.building naming art that isn't present).
  let key = buildingKeyFor(community)
  if (!scene.textures.exists(`building.${key}.roof`)) key = DEFAULT_BUILDING

  // Roof — top 36% of the footprint.
  const roof = scene.add
    .image(cx, cy, `building.${key}.roof`)
    .setOrigin(0, 0)
    .setDisplaySize(w, h * 0.36)
    .setDepth((plot.row + plot.h) * 10 - 1)

  // Body — bottom 64%.
  const body = scene.add
    .image(cx, cy + h * 0.36, `building.${key}.body`)
    .setOrigin(0, 0)
    .setDisplaySize(w, h * 0.64)
    .setDepth((plot.row + plot.h) * 10 - 1)

  // Nameplate under the building — small text, dark on light.
  const plate = scene.add
    .text(cx + w / 2, cy + h - 4, community.title.toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#2c1d10',
      backgroundColor: '#f3e6bb',
      padding: { x: 4, y: 1 },
    })
    .setOrigin(0.5, 0)
    .setDepth((plot.row + plot.h) * 10 + 1)

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

// Render tall props from the atlas (townTileset.tallPropsFor). Each is
// bottom-anchored on its tile so it overflows upward, and depth-sorted by
// its base row so the player passes in front of / behind it correctly. A
// prop flagged `blocks` adds its base tile to propCells for walkability.
function addTallProps(scene: Scene) {
  scene.propCells.clear()
  const tree = scene._treeObject
  for (const { key, col, row } of tallPropsFor(scene.town)) {
    if (!scene.textures.exists(key)) continue
    const def = (PROPS as any)[key]
    // Footprint: an admin tree object wins for the tree key; otherwise the
    // bundled prop definition.
    const useTree = key === 'prop.tree' && tree
    const wTiles = (useTree ? tree.footprint_w : def?.wTiles) || 1
    const hTiles = (useTree ? tree.footprint_h : def?.hTiles) || 1
    const sprite = scene.add
      .image(col * TILE + TILE / 2, (row + 1) * TILE, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(wTiles * TILE, hTiles * TILE)
      .setDepth((row + 1) * 10 - 1)
    if (DEV) scene.devLayers?.trees?.push(sprite)
    if (def?.blocks) scene.propCells.add(`${col},${row}`)
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
