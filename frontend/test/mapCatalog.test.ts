import { describe, expect, it } from 'vitest'

import { catalogFromGroundTiles } from '../src/admin/mapCatalog.ts'
import type { GroundTile } from '../src/groundTiles/schema.ts'

// Minimal GroundTile builder — only the fields the catalog reads matter.
const gt = (p: Partial<GroundTile> & Pick<GroundTile, 'tile_type' | 'tileset' | 'col' | 'row' | 'role'>): GroundTile => ({
  id: 0,
  cell: 32,
  label: '',
  side: null,
  updated_at: '',
  ...p,
})

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
  it('orders the stack by hardcoded terrain priority (low→high), matching the town', () => {
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 })
    expect(cat.stack).toEqual(['water', 'road', 'dirt', 'grass'])
  })

  it('marks terrains with edge/corner art as autotiled, fill-only ones as not', () => {
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 })
    expect(cat.autotiled).toEqual(new Set(['grass', 'dirt']))
  })

  it('carries each referenced tileset with its cell and image column count', () => {
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 })
    expect(cat.tilesets).toEqual([{ name: 'Terra', cell: 32, cols: 32 }])
  })

  it('maps each ground tile to catalog art the baker resolves against', () => {
    const cat = catalogFromGroundTiles(TILES, { Terra: 32 })
    // grass fill at col3,row13 with cols=32 → frame 419, the real mapped tile.
    expect(cat.tiles).toContainEqual({ tile_type: 'grass', tileset: 'Terra', col: 3, row: 13, role: 'fill', side: null })
    expect(cat.tiles).toContainEqual({ tile_type: 'grass', tileset: 'Terra', col: 1, row: 11, role: 'edge', side: 'N' })
  })

  it('appends unknown terrains after the known priority order', () => {
    const cat = catalogFromGroundTiles([gt({ tile_type: 'lava', tileset: 'Terra', col: 0, row: 0, role: 'fill' }), ...TILES], { Terra: 32 })
    expect(cat.stack).toEqual(['water', 'road', 'dirt', 'grass', 'lava'])
  })
})
