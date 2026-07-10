import { describe, expect, it } from 'vitest'

import { catalogFromGroundTiles } from '../src/admin/mapCatalog.ts'
import type { GroundTile } from '../src/catalog/groundTiles/schema.ts'

// Minimal GroundTile builder — only the fields the catalog reads matter.
const gt = (p: Partial<GroundTile> & Pick<GroundTile, 'tile_type' | 'tileset' | 'col' | 'row' | 'role'>): GroundTile => ({
  id: 0,
  cell: 32,
  label: '',
  side: null,
  updated_at: '',
  ...p,
})

// Terrain priority as served by /api/v1/terrains (#120), low→high — the data the
// catalog derives its stack from instead of a hardcoded order.
const PRIORITY = ['water', 'road', 'sand', 'dirt', 'grass']

// The real mapped tiles (from the dev DB): grass + dirt carry edge/corner art,
// road + water are fill-only.
const TILES: GroundTile[] = [
  gt({ tile_type: 'grass', tileset: 'Terra', col: 3, row: 13, role: 'fill' }),
  gt({ tile_type: 'grass', tileset: 'Terra', col: 1, row: 11, role: 'edge', side: 'N' }),
  gt({ tile_type: 'grass', tileset: 'Terra', col: 0, row: 11, role: 'corner', side: 'NW' }),
  gt({ tile_type: 'dirt', tileset: 'Terra', col: 17, row: 51, role: 'fill' }),
  gt({ tile_type: 'dirt', tileset: 'Terra', col: 17, row: 50, role: 'edge', side: 'N' }),
  gt({ tile_type: 'road', tileset: 'Terra', col: 25, row: 9, role: 'fill' }),
  gt({ tile_type: 'water', tileset: 'Terra', col: 17, row: 12, role: 'fill' }),
]

describe('catalogFromGroundTiles', () => {
  it('orders the stack by the persisted terrain priority (low→high)', () => {
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 }, PRIORITY)
    expect(cat.stack).toEqual(['water', 'road', 'dirt', 'grass'])
  })

  it('flips seam ownership when the priority data is reordered', () => {
    // Reordering priority through the tool (grass now below dirt) reorders the
    // stack, so dirt owns the grass/dirt seam — data drives ownership, no code.
    const flipped = ['water', 'road', 'sand', 'grass', 'dirt']
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 }, flipped)
    expect(cat.stack).toEqual(['water', 'road', 'grass', 'dirt'])
  })

  it('marks terrains with edge/corner art as autotiled, fill-only ones as not', () => {
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 }, PRIORITY)
    expect(cat.autotiled).toEqual(new Set(['grass', 'dirt']))
  })

  it('carries each referenced tileset with its cell and image column count', () => {
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 }, PRIORITY)
    expect(cat.tilesets).toEqual([{ name: 'Terra', cell: 32, cols: 32 }])
  })

  it('maps each ground tile to catalog art the baker resolves against', () => {
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 }, PRIORITY)
    // grass fill at col3,row13 with cols=32 → frame 419, the real mapped tile.
    expect(cat.tiles).toContainEqual({ tile_type: 'grass', tileset: 'Terra', col: 3, row: 13, role: 'fill', side: null })
    expect(cat.tiles).toContainEqual({ tile_type: 'grass', tileset: 'Terra', col: 1, row: 11, role: 'edge', side: 'N' })
  })

  it('appends unknown terrains after the known priority order', () => {
    const cat = catalogFromGroundTiles([gt({ tile_type: 'lava', tileset: 'Terra', col: 0, row: 0, role: 'fill' }), ...TILES], { Terra: 32 }, PRIORITY)
    expect(cat.stack).toEqual(['water', 'road', 'dirt', 'grass', 'lava'])
  })
})
