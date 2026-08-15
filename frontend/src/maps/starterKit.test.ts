// Pins the generated map-authoring starter kit (scripts/build-map-starter-kit.mjs):
// the starter.tmj we hand outside admins must pass the real importer, and every
// tileset it embeds must name a PNG that actually exists under
// public/maps/tilesets/ — because the runtime resolves that name straight to
// `/maps/tilesets/<name>.png` (kernel/mapRenderer.ts). If someone adds or renames
// a tileset PNG without re-running the script, this fails instead of the admin.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTiledGround, importTiledMap } from './tiledImport.ts'

const PUBLIC_MAPS = join(import.meta.dirname, '../../public/maps')
// Read rather than import: .tmj is Tiled's JSON extension, not one Vite resolves.
const starter = JSON.parse(readFileSync(join(PUBLIC_MAPS, 'starter.tmj'), 'utf8'))

describe('map starter kit', () => {
  it('passes the importer with every PNG resolving on disk', async () => {
    const pngExists = async (name: string) =>
      existsSync(join(PUBLIC_MAPS, 'tilesets', `${name}.png`))

    // A blank starter has no painted gids, so this asserts the structural
    // checks and the PNG probe — exactly what breaks when a PNG moves.
    const g = await importTiledMap(starter, pngExists)
    expect([g.cols, g.rows]).toEqual([starter.width, starter.height])
  })

  it('embeds every tileset the server can draw', () => {
    expect(starter.tilesets.length).toBeGreaterThan(0)
    for (const ts of starter.tilesets) {
      expect(ts.source).toBeUndefined() // external refs are rejected on import
      expect(ts.name).toBe(ts.image.replace(/^tilesets\//, '').replace(/\.png$/, ''))
    }
  })

  it('resolves a painted gid back to the tileset the author clicked', () => {
    // The kit is only useful if gid → (tileset, frame) lands where Tiled says.
    // Paint the first cell with the last tileset's first tile and check both.
    const last = starter.tilesets[starter.tilesets.length - 1]
    const painted = structuredClone(starter)
    painted.layers[0].data[0] = last.firstgid

    const cell = importTiledGround(painted).cells[0][0]
    expect(cell).toEqual([{ tileset: last.name, frame: 0, depth: 0 }])
  })
})
