// trim-pack.mjs — ingest the Modern Interiors Character Generator (ADR-0018).
//
// Source part sheets are never committed (public repo + a licence that forbids
// redistribution, and a 1792×1312 sheet decodes to ~9.4 MB of GPU memory). This
// crops each part sheet to only the ~28 rects the authored layout names and
// repacks them into one compact atlas — ~4 KB per Part instead of ~50 KB.
//
// Usage:
//   node scripts/trim-pack.mjs <source-Character_Generator-dir>
//
// Reads  public/maps/characters/packs/modern-interiors/authored-layout.json
// Emits  layout.json (packed) + one <name>.png atlas per adult 32×32 Part.
//
// Not runnable in CI: source art lives outside the repo (map-assets/).

import sharp from 'sharp'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const COLS = 8 // atlas columns; 28 frames → 4 rows → 256×256

// Pure: authored layout → { packed, slots }. Deterministic, no I/O.
// `slots` are the distinct source rects in first-appearance order; the packed
// layout rewrites every posture rect to its slot's position in the atlas.
export function packLayout(authored) {
  const slots = []
  const index = new Map() // "x,y,w,h" → slot index
  const slotFor = (r) => {
    const key = `${r.x},${r.y},${r.w},${r.h}`
    if (!index.has(key)) {
      index.set(key, slots.length)
      slots.push({ src: { x: r.x, y: r.y, w: r.w, h: r.h }, dst: null })
    }
    return index.get(key)
  }

  const postures = {}
  for (const [name, frames] of Object.entries(authored.postures)) {
    postures[name] = frames.map((r) => {
      const i = slotFor(r)
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const dst = { x: col * r.w, y: row * r.h }
      slots[i].dst = dst
      return { x: dst.x, y: dst.y, w: r.w, h: r.h }
    })
  }

  const rows = Math.ceil(slots.length / COLS)
  const cellW = slots[0]?.src.w ?? 0
  const cellH = slots[0]?.src.h ?? 0
  const atlas = { width: COLS * cellW, height: rows * cellH }

  const { sheet, ...rest } = authored // drop authored sheet dims; packed is atlas-relative
  return { packed: { ...rest, atlas, postures }, slots }
}

// Composite a Look: stack one frame from each atlas (body→eyes→…→accessory) at
// `rect` (a packed-layout posture frame). Proves atlases mix against the shared
// layout; backs the golden-image test. Deterministic PNG, same knobs as trim().
export async function composeLook(atlasPaths, rect) {
  const overlays = await Promise.all(
    atlasPaths.map(async (p) => ({
      input: await sharp(p).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).png().toBuffer(),
    })),
  )
  return sharp({ create: { width: rect.w, height: rect.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(overlays)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

// The five adult 32×32 Part categories in scope, each mapping a source filename
// to a pack-scoped name. Kids are out of scope (CONTEXT.md → Adult / kid).
const CATEGORIES = [
  { dir: 'Bodies/32x32', re: /^Body_32x32_(\d+)\.png$/i, name: (m) => `body-${m[1]}` },
  { dir: 'Eyes/32x32', re: /^Eyes_32x32_(\d+)\.png$/i, name: (m) => `eyes-${m[1]}` },
  { dir: 'Outfits/32x32', re: /^Outfit_(\d+)_32x32_(\d+)\.png$/i, name: (m) => `outfit-${m[1]}-${m[2]}` },
  { dir: 'Hairstyles/32x32', re: /^Hairstyle_(\d+)_32x32_(\d+)\.png$/i, name: (m) => `hairstyle-${m[1]}-${m[2]}` },
  // Accessories carry a descriptive word (Accessory_01_Ladybug_…); the style +
  // variant numbers are the stable address, so the word is dropped.
  { dir: 'Accessories/32x32', re: /^Accessory_(\d+)_.+_32x32_(\d+)\.png$/i, name: (m) => `accessory-${m[1]}-${m[2]}` },
]

async function listParts(sourceDir) {
  const parts = []
  for (const cat of CATEGORIES) {
    const abs = path.join(sourceDir, cat.dir)
    for (const file of (await readdir(abs)).sort()) {
      const m = cat.re.exec(file)
      if (m) parts.push({ name: cat.name(m), file: path.join(abs, file) })
    }
  }
  return parts.sort((a, b) => a.name.localeCompare(b.name))
}

// Crop a source sheet down to the atlas. compressionLevel is fixed so a second
// run over unchanged inputs produces byte-identical PNGs (idempotency).
async function trim(file, slots, atlas) {
  const src = sharp(file)
  const overlays = await Promise.all(
    slots.map(async (s) => ({
      input: await src.clone().extract({ left: s.src.x, top: s.src.y, width: s.src.w, height: s.src.h }).png().toBuffer(),
      left: s.dst.x,
      top: s.dst.y,
    })),
  )
  return sharp({ create: { width: atlas.width, height: atlas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(overlays)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  const sourceDir = process.argv[2]
  if (!sourceDir) {
    console.error('usage: node scripts/trim-pack.mjs <source-Character_Generator-dir>')
    process.exit(1)
  }
  const packDir = fileURLToPath(new URL('../public/maps/characters/packs/modern-interiors/', import.meta.url))
  const authored = JSON.parse(await readFile(path.join(packDir, 'authored-layout.json'), 'utf8'))
  const { packed, slots } = packLayout(authored)

  const parts = await listParts(sourceDir)
  for (const p of parts) {
    await writeFile(path.join(packDir, `${p.name}.png`), await trim(p.file, slots, packed.atlas))
  }
  // Stable key order + trailing newline so the file is diff-friendly & idempotent.
  await writeFile(path.join(packDir, 'layout.json'), JSON.stringify(packed, null, 1) + '\n')
  console.log(`trimmed ${parts.length} parts → ${packDir}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
