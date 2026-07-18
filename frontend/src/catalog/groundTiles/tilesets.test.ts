// Pins the tileset-folder convention (tiled/README.md, #230): every bundled
// tileset the ground-tile mapper can pick from is category-prefixed and its PNG
// is served from that category folder — no tileset sits flat at the top of
// public/maps/tilesets/ anymore. Guards against a TILESETS entry drifting from
// the PNG that actually ships (a mismatch surfaces as a 404 at play time).

import { describe, expect, it } from 'vitest'
import { TILESETS } from './tilesets.js'

// Vite resolves these at build time against the real files on disk, so the set
// of served PNGs is discovered, not hardcoded. Keys are paths relative here.
const pngs = import.meta.glob('../../../public/maps/tilesets/**/*.png')
const served = new Set(
  Object.keys(pngs).map((p) => p.replace(/^.*\/tilesets\//, '').replace(/\.png$/, '')),
)

describe('bundled tilesets', () => {
  it('are all category-prefixed (nothing flat at the top level)', () => {
    for (const { name } of TILESETS) {
      expect(name, `${name} should live under a category folder`).toContain('/')
    }
  })

  it('each resolve to a real served PNG', () => {
    for (const { name } of TILESETS) {
      expect(served.has(name), `/maps/tilesets/${name}.png must exist on disk`).toBe(true)
    }
  })

  it('leave no flat PNG at the top of public/maps/tilesets/', () => {
    const flat = [...served].filter((name) => !name.includes('/'))
    expect(flat, 'all tileset PNGs belong in a category folder').toEqual([])
  })
})
