import { beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'

import manifest from '../public/maps/characters/scout.json'
import { POSTURE_KEYS } from '../src/character/manifest.js'

// Regression guard for the committed default character (#151). This file is the
// fallback the game loads for a fresh user with no server-side/localStorage
// manifest, so a bad frame here ships a broken avatar to every new player.
//
// The original bug: idleUp/walkUp pointed at the sheet's decorative "sleep"
// head-only row (y:192), so on login — where the town entrance spawns the
// player facing UP — the avatar rendered as a floating cap/blob with no body,
// and the "walk" was 6 near-identical heads (a frozen still image). Left/right
// were empty and only worked via the down-fallback.
//
// The invariant that catches it: every authored frame is a full-height cell
// with opaque pixels at the BOTTOM (render.originY is 1, so the feet sit at the
// cell's bottom edge). A head-only sprite leaves the bottom rows empty.

type Rect = { x: number; y: number; w: number; h: number }
const postures = manifest.postures as Record<string, Rect[]>

let data: Uint8Array
let width = 0
let height = 0
let channels = 4

beforeAll(async () => {
  const out = await sharp(`public${manifest.sheet.path}`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  data = Uint8Array.from(out.data)
  width = out.info.width
  height = out.info.height
  channels = out.info.channels
})

const alphaAt = (x: number, y: number) => data[(y * width + x) * channels + 3]!

// Opaque pixel count in the bottom 8 rows of a frame cell — the feet zone.
function bottomFill(r: Rect) {
  let c = 0
  for (let y = r.y + r.h - 8; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (alphaAt(x, y) > 16) c++
  return c
}

describe('committed default scout manifest (#151)', () => {
  it('sheet matches the manifest-declared dimensions', () => {
    expect(width).toBe(manifest.sheet.width)
    expect(height).toBe(manifest.sheet.height)
  })

  it('authors every posture slot — a complete 4-direction rig, no empty fallbacks', () => {
    for (const slot of POSTURE_KEYS) {
      // climb slots stay optional (#54); the 8 idle/walk slots must be present.
      if (slot.startsWith('climb')) continue
      expect(postures[slot], `${slot} must be authored`).toBeTruthy()
      expect(postures[slot].length, `${slot} frames`).toBeGreaterThan(0)
    }
  })

  it('every frame is a full-height cell with the body grounded at the bottom (not a head-only blob)', () => {
    for (const [slot, frames] of Object.entries(postures)) {
      frames.forEach((r, i) => {
        const where = `${slot}.${i} @ (${r.x},${r.y},${r.w}x${r.h})`
        // within sheet bounds
        expect(r.x + r.w, `${where} exceeds sheet width`).toBeLessThanOrEqual(width)
        expect(r.y + r.h, `${where} exceeds sheet height`).toBeLessThanOrEqual(height)
        // full authoring cell
        expect(r.w, `${where} width`).toBe(manifest.grid.frameWidth)
        expect(r.h, `${where} height`).toBe(manifest.grid.frameHeight)
        // feet present at the bottom edge (origin) — the blob had 0 here
        expect(
          bottomFill(r),
          `${where} has an empty bottom edge (floating/partial sprite)`,
        ).toBeGreaterThan(0)
      })
    }
  })
})
