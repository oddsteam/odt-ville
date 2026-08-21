// Pins the Tiled importer (ADR-0007, #130): a Tiled JSON export with embedded
// tilesets converts to the existing BakedGround shape — frame = gid − firstgid
// via the owning tileset, tile-layer order → depth — and a bad export fails
// loudly at import, listing every reason. The importer is pure (no DOM/Phaser),
// unit-tested like the map baker.

import { describe, expect, it } from 'vitest'
import { importTiledGround, importTiledMap } from './tiledImport.ts'
import sampletown from '../../public/maps/sampletown.json'

// Minimal well-formed Tiled map: two embedded tilesets (so gid→frame crosses a
// firstgid offset) and two tile layers over a 2×1 grid, plus an object layer the
// importer must ignore.
const ts = (over: object) => ({
  firstgid: 1,
  name: 'A',
  image: 'tilesets/A.png',
  tilewidth: 32,
  tileheight: 32,
  columns: 4,
  margin: 0,
  spacing: 0,
  ...over,
})

const GOOD = {
  type: 'map',
  width: 2,
  height: 1,
  tilewidth: 32,
  tileheight: 32,
  tilesets: [
    ts({}),
    ts({ firstgid: 100, name: 'B', image: 'tilesets/B.png', columns: 8 }),
  ],
  layers: [
    { type: 'tilelayer', name: 'ground', width: 2, height: 1, data: [1, 5] },
    { type: 'tilelayer', name: 'over', width: 2, height: 1, data: [0, 100] },
    { type: 'objectgroup', name: 'collisions', objects: [{ x: 0, y: 0, width: 32, height: 32 }] },
  ],
}

describe('importTiledGround', () => {
  it('converts tile layers to BakedGround: gid→frame across tilesets, layer→depth', () => {
    const g = importTiledGround(GOOD)

    expect(g.cols).toBe(2)
    expect(g.rows).toBe(1)
    // gid 1 → A frame 0 at depth 0; gid 5 → A frame 4; gid 100 → B frame 0 at depth 1.
    expect(g.cells[0][0]).toEqual([{ tileset: 'A', frame: 0, depth: 0 }])
    expect(g.cells[0][1]).toEqual([
      { tileset: 'A', frame: 4, depth: 0 },
      { tileset: 'B', frame: 0, depth: 1 },
    ])
    // Only referenced tilesets, carrying {name, cell}. Object layer ignored.
    expect(g.tilesets).toEqual([
      { name: 'A', cell: 32 },
      { name: 'B', cell: 32 },
    ])
  })

  it('rejects an external (non-embedded) tileset reference', () => {
    const m = { ...GOOD, tilesets: [{ firstgid: 1, source: 'A.tsx' }] }
    expect(() => importTiledGround(m)).toThrow(/external/i)
  })

  it('rejects tiles that are not on the 32px grid', () => {
    const m = { ...GOOD, tilewidth: 16, tileheight: 16 }
    expect(() => importTiledGround(m)).toThrow(/32/)
  })

  it('rejects a tileset with non-zero margin or spacing', () => {
    const m = { ...GOOD, tilesets: [ts({ margin: 1 }), ts({ firstgid: 100, name: 'B', spacing: 2 })] }
    expect(() => importTiledGround(m)).toThrow(/margin|spacing/i)
  })

  // The committed sampletown export is the real thing #130 must import (AC 1).
  it('imports the committed sampletown map export', () => {
    const g = importTiledGround(sampletown as never)

    expect([g.cols, g.rows]).toEqual([30, 20])
    expect(g.tilesets.every((t) => t.cell === 32)).toBe(true)
    // Its four tile layers stack, so the busiest cell carries several depths.
    const maxDepth = Math.max(...g.cells.flat(2).map((l) => l.depth))
    expect(maxDepth).toBeGreaterThan(0)
  })
})

describe('importTiledMap (PNG-exists adapter)', () => {
  it('rejects a referenced tileset whose PNG does not resolve', async () => {
    const pngExists = async (name: string) => name === 'A' // B is missing
    await expect(importTiledMap(GOOD, pngExists)).rejects.toThrow(/B/)
  })

  it('imports when every referenced PNG resolves', async () => {
    const g = await importTiledMap(GOOD, async () => true)
    expect([g.cols, g.rows]).toEqual([2, 1])
  })
})
