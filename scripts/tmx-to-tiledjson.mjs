#!/usr/bin/env node
// Convert a Tiled .tmx (CSV-encoded) map into Phaser-friendly Tiled JSON.
//
// Why this exists: Phaser's tilemap loader reads Tiled *JSON*, not .tmx XML,
// and it cannot render Tiled's "oblique" orientation. The source map
// (tipco/sampletown.tmx) is an oblique grid whose tile data is a plain
// row-major grid, so we re-emit it as "orthogonal" (top-down) — the only
// thing that changes is the projection used to *display* the same grid.
//
// The external .tsx tilesets the .tmx references don't ship with the repo,
// so we inline each tileset's geometry here (computed from the bundled PNG
// dimensions) and point `image` at the copies under public/maps/tilesets/.
//
// Usage: node scripts/tmx-to-tiledjson.mjs <input.tmx> <output.json>

import { readFileSync, writeFileSync } from 'node:fs'

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('usage: tmx-to-tiledjson.mjs <input.tmx> <output.json>')
  process.exit(1)
}

const xml = readFileSync(inPath, 'utf8')

// --- map header --------------------------------------------------------
const mapAttrs = Object.fromEntries(
  [...xml.matchAll(/(\w+)="([^"]*)"/g)]
    .slice(0, 20)
    .map((m) => [m[1], m[2]]),
)
const width = Number(mapAttrs.width)
const height = Number(mapAttrs.height)
const tilewidth = Number(mapAttrs.tilewidth)
const tileheight = Number(mapAttrs.tileheight)

// --- tilesets ----------------------------------------------------------
// firstgid + image come from the .tmx; geometry is derived from the actual
// bundled PNG sizes (verified against the firstgid spacing in the source).
const TILESET_META = {
  '1_Terrains_and_Fences_32x32.tsx': { png: '1_Terrains_and_Fences_32x32.png', imagewidth: 1024, imageheight: 2368 },
  '2_City_Terrains_32x32.tsx': { png: '2_City_Terrains_32x32.png', imagewidth: 1888, imageheight: 3296 },
  '5_Floor_Modular_Buildings_32x32.tsx': { png: '5_Floor_Modular_Buildings_32x32.png', imagewidth: 1024, imageheight: 8288 },
  '4_Generic_Buildings_32x32.tsx': { png: '4_Generic_Buildings_32x32.png', imagewidth: 1024, imageheight: 6400 },
  '10_Vehicles_32x32.tsx': { png: '10_Vehicles_32x32.png', imagewidth: 1024, imageheight: 5376 },
  'Interiors_free_32x32.tsx': { png: 'Interiors_free_32x32.png', imagewidth: 512, imageheight: 2848 },
}

// Unknown tilesets are skipped (with a warning) rather than aborting the whole
// convert — tiles using them won't render, but the rest of the map (and the
// object layers) still come through. To support a new tileset: bundle its PNG
// under public/maps/tilesets/, add a TILESET_META entry, and list its name in
// TiledMapScene.TILESETS.
const tilesets = [...xml.matchAll(/<tileset firstgid="(\d+)" source="([^"]*)"\/>/g)]
  .map((m) => {
    const firstgid = Number(m[1])
    const source = m[2].split('/').pop()
    const meta = TILESET_META[source]
    if (!meta) {
      console.warn(`WARN: unknown tileset "${source}" — skipping (its tiles won't render)`)
      return null
    }
    const columns = meta.imagewidth / tilewidth
    const rows = meta.imageheight / tileheight
    return {
      firstgid,
      name: meta.png.replace(/\.png$/, ''),
      image: `tilesets/${meta.png}`,
      imagewidth: meta.imagewidth,
      imageheight: meta.imageheight,
      tilewidth,
      tileheight,
      columns,
      tilecount: columns * rows,
      margin: 0,
      spacing: 0,
    }
  })
  .filter(Boolean)

// --- tile layers -------------------------------------------------------
const layers = []
const layerRe = /<layer id="(\d+)" name="([^"]*)"[^>]*>\s*<data encoding="csv">([\s\S]*?)<\/data>\s*<\/layer>/g
for (const m of xml.matchAll(layerRe)) {
  const id = Number(m[1])
  const name = m[2]
  const data = m[3]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
  if (data.length !== width * height) {
    throw new Error(`layer ${name}: ${data.length} cells, expected ${width * height}`)
  }
  layers.push({
    id,
    name,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width,
    height,
    opacity: 1,
    visible: true,
    data,
  })
}

// --- object layers (collisions, signs, …) ------------------------------
// Emit every <objectgroup>, not just the first, so custom layers authored in
// Tiled (e.g. a "signs" layer of anchor rectangles) reach the game. Each
// object's custom <properties> are parsed into a flat `properties` object.
const ogRe = /<objectgroup id="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/objectgroup>/g
for (const ogMatch of xml.matchAll(ogRe)) {
  const objects = []
  const body = ogMatch[3]
  // Each <object ...> either self-closes or wraps <polygon>/<properties>.
  const objRe = /<object\b([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/g
  for (const om of body.matchAll(objRe)) {
    const attrs = Object.fromEntries(
      [...om[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
    )
    const obj = {
      id: Number(attrs.id),
      name: attrs.name || '',
      type: attrs.type || '',
      x: Number(attrs.x) || 0,
      y: Number(attrs.y) || 0,
      width: Number(attrs.width) || 0,
      height: Number(attrs.height) || 0,
      rotation: Number(attrs.rotation) || 0,
      visible: true,
    }
    const inner = om[2] || ''
    const poly = inner.match(/<polygon points="([^"]*)"\/>/)
    if (poly) {
      obj.polygon = poly[1].split(' ').map((pt) => {
        const [px, py] = pt.split(',').map(Number)
        return { x: px, y: py }
      })
    } else if (!attrs.width && !attrs.height) {
      // No size and no polygon → a point marker in Tiled.
      obj.point = true
    }
    const props = parseProperties(inner)
    if (props) obj.properties = props
    objects.push(obj)
  }
  layers.push({
    id: Number(ogMatch[1]),
    name: ogMatch[2],
    type: 'objectgroup',
    draworder: 'topdown',
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    objects,
  })
}

// Tiled emits per-object <properties><property name= value=/></properties>.
// Return them as Tiled-JSON's array shape, or null if there are none.
function parseProperties(inner) {
  const block = inner.match(/<properties>([\s\S]*?)<\/properties>/)
  if (!block) return null
  const out = []
  for (const p of block[1].matchAll(/<property\b([^>]*?)\/?>/g)) {
    const a = Object.fromEntries([...p[1].matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
    if (!a.name) continue
    out.push({ name: a.name, type: a.type || 'string', value: a.value ?? '' })
  }
  return out.length ? out : null
}

// --- assemble ----------------------------------------------------------
const out = {
  type: 'map',
  version: mapAttrs.version || '1.10',
  tiledversion: mapAttrs.tiledversion || '1.12.2',
  orientation: 'orthogonal', // re-projected from the source's "oblique"
  renderorder: mapAttrs.renderorder || 'right-down',
  infinite: false,
  compressionlevel: -1,
  width,
  height,
  tilewidth,
  tileheight,
  nextlayerid: Number(mapAttrs.nextlayerid) || layers.length + 1,
  nextobjectid: Number(mapAttrs.nextobjectid) || 1,
  tilesets,
  layers,
}

writeFileSync(outPath, JSON.stringify(out, null, 1))
const objLayers = layers
  .filter((l) => l.type === 'objectgroup')
  .map((l) => `${l.name}(${l.objects.length})`)
  .join(', ')
console.log(
  `wrote ${outPath}: ${tilesets.length} tilesets, ` +
    `${layers.filter((l) => l.type === 'tilelayer').length} tile layers, ` +
    `object layers: ${objLayers || 'none'}`,
)
