// prep-building.mjs — turn one AI-generated building image into the
// roof + body pair the TownScene engine expects.
//
// The game draws a building as TWO stacked images (TownScene.addBuildingSprite):
//   roof  = top 36% of the footprint
//   body  = bottom 64% of the footprint
// Each is stretched to the plot via setDisplaySize(), so the SOURCE pixel
// size never has to match the map — only the aspect ratio matters, or the
// stretch distorts. This script normalizes any input to the canonical
// 384×508 (~3:4) building shape used by the existing guild art, then slices
// it at the 36/64 line.
//
// Usage:
//   node scripts/prep-building.mjs <input.png> <name> [--out dir] [--width 384] [--roof 0.36]
//
// Example:
//   node scripts/prep-building.mjs ~/Downloads/dalle-tower.png skyline-tower
//   → src/game/assets/buildings/skyline-tower-roof.png
//   → src/game/assets/buildings/skyline-tower-body.png
//
// The input should be a front-facing, flat (orthographic) building facade on
// a transparent background. Anything roughly 3:4 (taller than wide) works;
// other aspect ratios are letterboxed onto transparent, not stretched, so the
// building keeps its proportions.

import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = path.resolve(__dirname, '../src/game/assets/buildings')

// Canonical building shape, matching guild-roof (384×184) + guild-body (384×324).
const CANON_W = 384
const CANON_H = 508
const ROOF_FRAC = 0.36

function parseArgs(argv) {
  const pos = []
  const opt = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) opt[a.slice(2)] = argv[++i]
    else pos.push(a)
  }
  return { pos, opt }
}

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2))
  const [input, name] = pos
  if (!input || !name) {
    console.error(
      'Usage: node scripts/prep-building.mjs <input.png> <name> [--out dir] [--width 384] [--roof 0.36]',
    )
    process.exit(1)
  }

  const width = Number(opt.width || CANON_W)
  const roofFrac = Number(opt.roof || ROOF_FRAC)
  const height = Math.round((width / CANON_W) * CANON_H)
  const roofH = Math.round(height * roofFrac)
  const bodyH = height - roofH
  const outDir = opt.out ? path.resolve(opt.out) : DEFAULT_OUT
  await mkdir(outDir, { recursive: true })

  // 1. Normalize to the canonical box WITHOUT stretching: contain-fit onto a
  //    transparent canvas so the facade keeps its real proportions. The engine
  //    will stretch this box to the plot, and an in-proportion building inside
  //    a correct-aspect box ends up correct on the map.
  const normalized = await sharp(input)
    .ensureAlpha()
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'nearest', // keep pixel-art edges crisp
    })
    .png()
    .toBuffer()

  const roofPath = path.join(outDir, `${name}-roof.png`)
  const bodyPath = path.join(outDir, `${name}-body.png`)

  // 2. Slice top (roof) and bottom (body).
  await sharp(normalized)
    .extract({ left: 0, top: 0, width, height: roofH })
    .png()
    .toFile(roofPath)

  await sharp(normalized)
    .extract({ left: 0, top: roofH, width, height: bodyH })
    .png()
    .toFile(bodyPath)

  console.log(`✓ ${path.relative(process.cwd(), roofPath)}  (${width}×${roofH})`)
  console.log(`✓ ${path.relative(process.cwd(), bodyPath)}  (${width}×${bodyH})`)
  console.log(`\nRegister it in src/game/buildings.js, e.g.:`)
  console.log(`  '${name}': { roofUrl: '${name}-roof.png', bodyUrl: '${name}-body.png' },`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
