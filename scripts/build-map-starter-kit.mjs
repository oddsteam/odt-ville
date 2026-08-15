#!/usr/bin/env node
// Build the map-authoring starter kit an outside admin downloads to make a map.
//
// Why this exists: the Tiled importer (ADR-0007, frontend/src/maps/tiledImport.ts)
// only accepts *embedded* tilesets whose `name` is the tileset's path under
// public/maps/tilesets/ minus the .png — e.g. "terrain/2_City_Terrains_32x32".
// Getting that by hand in Tiled is fiddly and silently wrong when it isn't, and
// a non-developer can't add PNGs to the server anyway. So we generate one
// starter.tmj with every server tileset already embedded under the right name,
// zip it next to copies of the PNGs (Tiled needs the images on disk to draw
// them), and publish the zip as a static asset. The admin unzips, paints, saves
// as their own .tmj, and uploads it at /admin/maps/new — no tileset wrangling.
//
// Re-run this whenever public/maps/tilesets/ gains or loses a PNG.
//
// Usage: node scripts/build-map-starter-kit.mjs

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, openSync, readSync, closeSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

const GRID = 32 // the importer pins maps and tilesets to a 32px grid
const COLS = 40 // starter canvas; the editor's own paint tools cap at 40×40
const ROWS = 40

const root = new URL('..', import.meta.url).pathname
const tilesetsDir = join(root, 'frontend/public/maps/tilesets')
const outZip = join(root, 'frontend/public/maps/map-starter-kit.zip')
// The .tmj also ships unzipped: it's what the importer test asserts against,
// and anyone who already has the PNGs can take just this file.
const outTmj = join(root, 'frontend/public/maps/starter.tmj')

// Every .png under tilesets/, as repo-relative paths. Dot-directories (.omc)
// and macOS turds (.DS_Store, .textClipping) are not tilesets.
function findPngs(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...findPngs(p))
    else if (e.name.endsWith('.png')) out.push(p)
  }
  return out.sort()
}

// A PNG's pixel size lives in the IHDR chunk at a fixed offset: 8-byte
// signature + 4-byte length + 4-byte "IHDR", then width and height as
// big-endian uint32. Cheaper than pulling in an image library.
function pngSize(path) {
  const fd = openSync(path, 'r')
  const buf = Buffer.alloc(24)
  readSync(fd, buf, 0, 24, 0)
  closeSync(fd)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const pngs = findPngs(tilesetsDir)
if (!pngs.length) {
  console.error(`no tileset PNGs under ${tilesetsDir}`)
  process.exit(1)
}

// Embedded-tileset entries in Tiled's own JSON shape. `firstgid` accumulates
// across the list exactly as Tiled assigns it, so gid − firstgid is the frame.
const tilesets = []
const skipped = []
let firstgid = 1
for (const png of pngs) {
  const { width, height } = pngSize(png)
  // A sheet that isn't a whole number of 32px cells can't be a uniform
  // spritesheet, which is the only thing the runtime blits. Leave it out
  // rather than ship a kit that fails import.
  if (width % GRID || height % GRID) {
    skipped.push(`${relative(tilesetsDir, png)} (${width}×${height} is not a multiple of ${GRID})`)
    continue
  }
  const rel = relative(tilesetsDir, png).split(sep).join('/')
  const cols = width / GRID
  const rows = height / GRID
  tilesets.push({
    columns: cols,
    firstgid,
    image: `tilesets/${rel}`,
    imageheight: height,
    imagewidth: width,
    margin: 0,
    name: rel.replace(/\.png$/, ''), // the exact name the importer resolves back to a URL
    spacing: 0,
    tilecount: cols * rows,
    tileheight: GRID,
    tilewidth: GRID,
  })
  firstgid += cols * rows
}

const emptyLayer = (id, name) => ({
  data: new Array(COLS * ROWS).fill(0),
  height: ROWS,
  id,
  name,
  opacity: 1,
  type: 'tilelayer',
  visible: true,
  width: COLS,
  x: 0,
  y: 0,
})

// Two layers because the importer maps layer order → draw depth: anything on
// "decor" draws over "ground". More layers are fine; the author can add them.
const map = {
  compressionlevel: -1,
  height: ROWS,
  infinite: false,
  layers: [emptyLayer(1, 'ground'), emptyLayer(2, 'decor')],
  nextlayerid: 3,
  nextobjectid: 1,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.11.0',
  tileheight: GRID,
  tilesets,
  tilewidth: GRID,
  type: 'map',
  version: '1.10',
  width: COLS,
}

const README = `ODT Ville — map starter kit
===========================

You need Tiled (free): https://www.mapeditor.org/

1. Open starter.tmj in Tiled. Every tileset the server has is already loaded
   in the Tilesets panel on the right.
2. Paint your map. Use the "ground" layer for terrain and "decor" for things
   that draw on top. You can add more layers — later layers draw over earlier
   ones.
3. Resize the map if you want: Map > Resize Map. Keep the tile size at 32x32.
4. File > Save As... > name it whatever you like, keeping the .tmj extension.
   Do NOT use "Export As".
5. Go to /admin/maps/new in ODT Ville, pick your .tmj under "Import Tiled
   JSON", fill in a slug and title, and Save.

Rules the importer enforces (it will tell you which one you broke):

  - Tile size must be 32x32, on the map and on every tileset.
  - Tilesets must stay EMBEDDED. Never click "Export Tileset As" or detach a
    tileset — if you do, the map references an external .tsx file the server
    can't read.
  - Don't add your own tileset images. The server can only draw the tilesets
    in this kit. If you need new art, ask a developer to add the PNG to the
    server first.
  - Tileset margin and spacing must stay 0.

Object layers (including collisions) are ignored on import — a new map starts
fully walkable. You paint collision and place props in the app after saving.
`

// Stage the kit in a temp dir so the zip has clean top-level paths, then
// replace the published asset in one step.
const tmj = JSON.stringify(map, null, 1)
writeFileSync(outTmj, tmj)

const stage = mkdtempSync(join(tmpdir(), 'odt-map-kit-'))
try {
  mkdirSync(join(stage, 'tilesets'), { recursive: true })
  for (const ts of tilesets) {
    const dest = join(stage, ts.image)
    mkdirSync(join(dest, '..'), { recursive: true })
    cpSync(join(tilesetsDir, relative('tilesets', ts.image)), dest)
  }
  writeFileSync(join(stage, 'starter.tmj'), tmj)
  writeFileSync(join(stage, 'README.txt'), README)
  rmSync(outZip, { force: true })
  execFileSync('zip', ['-q', '-r', outZip, 'starter.tmj', 'README.txt', 'tilesets'], { cwd: stage })
} finally {
  rmSync(stage, { recursive: true, force: true })
}

console.log(`wrote ${relative(root, outZip)} — ${tilesets.length} tilesets, ${firstgid - 1} tiles`)
for (const s of skipped) console.warn(`  skipped ${s}`)
