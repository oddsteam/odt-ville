#!/usr/bin/env node
// curate-palette.mjs — turn the giant unstructured tilesets into a small,
// browsable palette of only the tiles you actually use.
//
// Why this exists: the bundled tilesets are huge composite sheets (e.g.
// 5_Floor_Modular_Buildings is 1024×8288 ≈ 8,300 tiles). Authoring a map in
// Tiled means hunting individual 32px tiles across ~25,000 of them through a
// tiny panel — high cognitive load, easy to lose your place. But the existing
// maps only use a few hundred of those tiles, and the building/prop blocks are
// really rectangular *stamps* (a contiguous crop of the sheet placed as one
// unit). This script reads the .tmx maps and emits:
//
//   public/maps/palette/
//     tiles/<tileset>-g<gid>.png    one PNG per distinct used single tile
//     stamps/<map>__<layer>__<n>.png   one PNG per detected multi-tile stamp
//     palette.json                  machine-readable manifest (seed for an editor)
//     index.html                    a contact sheet grouped by layer/stamp
//
// Browse index.html instead of Tiled's tileset panel: you see only what the
// town actually uses, whole buildings shown as single images, each labelled
// with its source + gid so you can still find it in Tiled if you need to.
//
// Usage:
//   node scripts/curate-palette.mjs [map.tmx ...]
//   (defaults to every .tmx under public/maps/ if none given)

import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAPS_DIR = path.resolve(__dirname, '../public/maps')
const TILESETS_DIR = path.join(MAPS_DIR, 'tilesets')
const OUT_DIR = path.join(MAPS_DIR, 'palette')

// Geometry of each bundled sheet, keyed by the .tsx name the .tmx references.
// (Same source-of-truth as tmx-to-tiledjson.mjs — the .tsx files don't carry
// image size in a form we parse, so we pin it from the actual PNG dimensions.)
const TILESET_META = {
  '1_Terrains_and_Fences_32x32.tsx': { png: '1_Terrains_and_Fences_32x32.png', imagewidth: 1024, imageheight: 2368 },
  '2_City_Terrains_32x32.tsx': { png: '2_City_Terrains_32x32.png', imagewidth: 1888, imageheight: 3296 },
  '5_Floor_Modular_Buildings_32x32.tsx': { png: '5_Floor_Modular_Buildings_32x32.png', imagewidth: 1024, imageheight: 8288 },
  '4_Generic_Buildings_32x32.tsx': { png: '4_Generic_Buildings_32x32.png', imagewidth: 1024, imageheight: 6400 },
  '10_Vehicles_32x32.tsx': { png: '10_Vehicles_32x32.png', imagewidth: 1024, imageheight: 5376 },
  'Interiors_free_32x32.tsx': { png: 'Interiors_free_32x32.png', imagewidth: 512, imageheight: 2848 },
}

// ---------------------------------------------------------------- .tmx parse
function parseMap(tmxPath) {
  const xml = readFileSync(tmxPath, 'utf8')
  const head = xml.match(/<map\b([^>]*)>/)[1]
  const attr = (s, k) => {
    const m = s.match(new RegExp(`${k}="([^"]*)"`))
    return m ? m[1] : undefined
  }
  const tilewidth = Number(attr(head, 'tilewidth'))
  const tileheight = Number(attr(head, 'tileheight'))
  const width = Number(attr(head, 'width'))
  const height = Number(attr(head, 'height'))

  // Tilesets, sorted by firstgid so a gid maps to the highest firstgid ≤ gid.
  const tilesets = [...xml.matchAll(/<tileset firstgid="(\d+)" source="([^"]*)"\/>/g)]
    .map((m) => {
      const source = m[2].split('/').pop()
      const meta = TILESET_META[source]
      if (!meta) {
        console.warn(`WARN: unknown tileset "${source}" — its tiles are skipped`)
        return null
      }
      const columns = meta.imagewidth / tilewidth
      return {
        firstgid: Number(m[1]),
        source,
        name: meta.png.replace(/\.png$/, ''),
        png: path.join(TILESETS_DIR, meta.png),
        columns,
        rows: meta.imageheight / tileheight,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.firstgid - b.firstgid)

  // Tile layers as 2D grids of gids (0 = empty).
  const layers = []
  const layerRe = /<layer id="\d+" name="([^"]*)"[^>]*>\s*<data encoding="csv">([\s\S]*?)<\/data>/g
  for (const m of xml.matchAll(layerRe)) {
    const flat = m[2].split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
    const grid = []
    for (let r = 0; r < height; r++) grid.push(flat.slice(r * width, (r + 1) * width))
    layers.push({ name: m[1], grid })
  }

  return { name: path.basename(tmxPath, '.tmx'), tilewidth, tileheight, width, height, tilesets, layers }
}

// Which tileset owns a gid, and where in its sheet (0-based col/row).
function locate(map, gid) {
  let ts = null
  for (const t of map.tilesets) if (gid >= t.firstgid) ts = t
  if (!ts) return null
  const local = gid - ts.firstgid
  return { ts, col: local % ts.columns, row: Math.floor(local / ts.columns) }
}

// ----------------------------------------------------------- stamp detection
// A "stamp" is a rectangle of map cells whose gids form a matching rectangular
// crop of one source sheet: gid(dr,dc) === topLeft + dr*columns + dc. That is
// exactly how a building/prop block is painted, so detecting it recovers the
// whole building as a single unit. Greedy maximal-rectangle scan; every cell
// covered by a stamp is marked so single-tile extraction skips it.
function detectStamps(map, layer) {
  const { grid } = layer
  const H = map.height
  const W = map.width
  const used = Array.from({ length: H }, () => new Array(W).fill(false))
  const stamps = []

  const coherent = (r, c, base, baseLoc) => {
    const g = grid[r][c]
    if (g === 0) return false
    const loc = locate(map, g)
    if (!loc || loc.ts !== baseLoc.ts) return false
    return g === base + (r - baseLoc.r0) * loc.ts.columns + (c - baseLoc.c0)
  }

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (used[r][c] || grid[r][c] === 0) continue
      const base = grid[r][c]
      const loc0 = locate(map, base)
      if (!loc0) continue
      const baseLoc = { ts: loc0.ts, r0: r, c0: c }

      // Expand right along row r.
      let w = 1
      while (c + w < W && !used[r][c + w] && coherent(r, c + w, base, baseLoc)) w++
      // Expand down: each new row must match across the full current width.
      let h = 1
      while (r + h < H) {
        let ok = true
        for (let dc = 0; dc < w; dc++) {
          if (used[r + h][c + dc] || !coherent(r + h, c + dc, base, baseLoc)) { ok = false; break }
        }
        if (!ok) break
        h++
      }

      for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) used[r + dr][c + dc] = true
      stamps.push({ gid: base, ts: loc0.ts, col: loc0.col, row: loc0.row, w, h, mapCol: c, mapRow: r })
    }
  }
  return stamps
}

// ---------------------------------------------------------------------- main
async function main() {
  const args = process.argv.slice(2)
  const tmxFiles = args.length
    ? args.map((a) => path.resolve(a))
    : readdirSync(MAPS_DIR).filter((f) => f.endsWith('.tmx')).map((f) => path.join(MAPS_DIR, f))

  if (!tmxFiles.length) {
    console.error('No .tmx maps found under', MAPS_DIR)
    process.exit(1)
  }

  await mkdir(path.join(OUT_DIR, 'tiles'), { recursive: true })
  await mkdir(path.join(OUT_DIR, 'stamps'), { recursive: true })

  // Both singles and stamps are deduped by crop identity (same sheet + gid +
  // size = identical pixels), so near-duplicate maps don't bloat the palette.
  // Each record tracks every map/layer it appears in, and how many times.
  const singles = new Map() // key -> {gid, ts, col, row, file, layers:Set, count}
  const stampMap = new Map() // key -> {file, w, h, gid, ts, col, row, layers:Set, maps:Set, count, _crop}
  const TW = 32
  const TH = 32

  for (const tmx of tmxFiles) {
    const map = parseMap(tmx)
    for (const layer of map.layers) {
      const stamps = detectStamps(map, layer)
      for (const s of stamps) {
        if (s.w === 1 && s.h === 1) {
          const key = `${s.ts.name}-g${s.gid}`
          let rec = singles.get(key)
          if (!rec) {
            rec = { gid: s.gid, ts: s.ts, col: s.col, row: s.row, file: `tiles/${key}.png`, layers: new Set(), count: 0 }
            singles.set(key, rec)
          }
          rec.layers.add(layer.name)
          rec.count++
        } else {
          const key = `${s.ts.name}-g${s.gid}-${s.w}x${s.h}`
          let rec = stampMap.get(key)
          if (!rec) {
            rec = {
              file: `stamps/${key}.png`, w: s.w, h: s.h, gid: s.gid,
              ts: s.ts, tsName: s.ts.name, col: s.col, row: s.row,
              layers: new Set(), maps: new Set(), count: 0,
              _crop: { png: s.ts.png, left: s.col * TW, top: s.row * TH, width: s.w * TW, height: s.h * TH },
            }
            stampMap.set(key, rec)
          }
          rec.layers.add(layer.name)
          rec.maps.add(map.name)
          rec.count++
        }
      }
    }
  }
  const allStamps = [...stampMap.values()]

  // Extract single tiles.
  for (const rec of singles.values()) {
    await sharp(rec.ts.png)
      .extract({ left: rec.col * TW, top: rec.row * TH, width: TW, height: TH })
      .png()
      .toFile(path.join(OUT_DIR, rec.file))
  }
  // Extract stamps.
  for (const st of allStamps) {
    await sharp(st._crop.png)
      .extract({ left: st._crop.left, top: st._crop.top, width: st._crop.width, height: st._crop.height })
      .png()
      .toFile(path.join(OUT_DIR, st.file))
  }

  // palette.json — the machine-readable manifest (seed for a stamp editor).
  const manifest = {
    generatedFrom: tmxFiles.map((f) => path.basename(f)),
    tilewidth: TW,
    tileheight: TH,
    singles: [...singles.values()].map((r) => ({
      gid: r.gid, tileset: r.ts.name, col: r.col, row: r.row,
      file: r.file, layers: [...r.layers], uses: r.count,
    })),
    stamps: allStamps.map((s) => ({
      gid: s.gid, tileset: s.tsName, col: s.col, row: s.row,
      w: s.w, h: s.h, file: s.file,
      layers: [...s.layers], maps: [...s.maps], uses: s.count,
    })),
  }
  writeFileSync(path.join(OUT_DIR, 'palette.json'), JSON.stringify(manifest, null, 2))

  // index.html — the browsable contact sheet.
  writeFileSync(path.join(OUT_DIR, 'index.html'), renderHtml(manifest))

  console.log(
    `✓ palette: ${manifest.singles.length} single tiles, ${manifest.stamps.length} stamps\n` +
    `  → ${path.relative(process.cwd(), path.join(OUT_DIR, 'index.html'))}`,
  )
}

function renderHtml(m) {
  const byLayerSingles = {}
  for (const s of m.singles) for (const l of s.layers) (byLayerSingles[l] ||= []).push(s)
  const byLayerStamps = {}
  for (const s of m.stamps) for (const l of s.layers) (byLayerStamps[l] ||= []).push(s)

  const cell = (img, label, title) =>
    `<figure title="${title}"><img src="${img}" alt=""><figcaption>${label}</figcaption></figure>`

  const singleSection = Object.entries(byLayerSingles).map(([layer, items]) =>
    `<h2>tiles · ${layer} <small>(${items.length})</small></h2><div class="grid">` +
    items.sort((a, b) => a.gid - b.gid).map((s) =>
      cell(s.file, `g${s.gid}`, `${s.tileset} · gid ${s.gid} · col ${s.col} row ${s.row} · used ${s.uses}×`),
    ).join('') + '</div>',
  ).join('')

  const stampSection = Object.entries(byLayerStamps).map(([layer, items]) =>
    `<h2>stamps · ${layer} <small>(${items.length})</small></h2><div class="grid stamps">` +
    items.sort((a, b) => b.w * b.h - a.w * a.h).map((s) =>
      cell(s.file, `${s.w}×${s.h} g${s.gid}`, `${s.tileset} · gid ${s.gid} · ${s.w}×${s.h} tiles · used ${s.uses}×`),
    ).join('') + '</div>',
  ).join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ODT-Ville · curated palette</title><style>
:root{color-scheme:dark}
body{margin:0;padding:24px;font:14px/1.4 system-ui,sans-serif;background:#15161a;color:#e6e6e6}
h1{margin:0 0 4px}p.sub{margin:0 0 24px;color:#9aa0aa}
h2{margin:32px 0 8px;font-size:15px;font-weight:600;border-bottom:1px solid #2a2c33;padding-bottom:6px}
h2 small{color:#7a808a;font-weight:400}
.grid{display:flex;flex-wrap:wrap;gap:10px}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:6px;border-radius:8px;background:#1d1f25;border:1px solid #2a2c33}
figure:hover{border-color:#4a90d9;background:#22252c}
figure img{image-rendering:pixelated;width:64px;height:64px;object-fit:contain;background:repeating-conic-gradient(#2a2c33 0 25%,#1d1f25 0 50%) 0 0/12px 12px}
.stamps figure img{width:auto;height:auto;max-width:160px;max-height:160px}
figcaption{font-size:11px;color:#9aa0aa;font-variant-numeric:tabular-nums}
</style></head><body>
<h1>ODT-Ville · curated palette</h1>
<p class="sub">From ${m.generatedFrom.join(', ')} — only the tiles the town actually uses.
Hover for source sheet + gid. Click to copy the gid.</p>
${stampSection}
${singleSection}
<script>
document.querySelectorAll('figure').forEach(f=>f.addEventListener('click',()=>{
  const g=(f.querySelector('figcaption').textContent.match(/g(\\d+)/)||[])[1];
  if(g){navigator.clipboard?.writeText(g);f.style.borderColor='#52c41a';setTimeout(()=>f.style.borderColor='',600)}
}));
</script></body></html>`
}

main().catch((err) => {
  console.error(err.stack || err.message || err)
  process.exit(1)
})
