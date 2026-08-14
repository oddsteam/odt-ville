import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { composeLook } from '../scripts/trim-pack.mjs'
import layout from '../public/maps/characters/packs/modern-interiors/layout.json'

// Relative to cwd (frontend/), matching the sharp-by-path style of the other
// character tests — this suite touches no node:fs, which the tsconfig can't type.
const PACK = 'public/maps/characters/packs/modern-interiors'
// A known 5-part Look, one per slot: body → eyes → outfit → hairstyle → accessory.
const LOOK = ['body-01', 'eyes-01', 'outfit-01-01', 'hairstyle-07-03', 'accessory-15-01']
const GOLDEN = 'test/fixtures/modern-interiors-look.png'

const raw = (buf: string | Uint8Array) => sharp(buf).raw().toBuffer()

describe('modern-interiors packed atlases', () => {
  it('composite a 5-part Look that matches the checked-in golden image', async () => {
    const composed = await composeLook(
      LOOK.map((n) => `${PACK}/${n}.png`),
      layout.postures.idleDown[0],
    )
    // Compare decoded pixels, not PNG bytes — immune to encoder drift, still
    // pins the packed layout + every atlas's cropped pixels against regression.
    expect((await raw(composed)).equals(await raw(GOLDEN))).toBe(true)
  })
})
