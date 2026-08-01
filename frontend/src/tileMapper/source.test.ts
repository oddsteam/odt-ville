import { describe, expect, it } from 'vitest'

import { effectiveCell } from './TileMapper.tsx'
import { TILESETS } from '../catalog/groundTiles/service.ts'

// In tileset mode the registry is authoritative (#351) — the Cell input is
// hidden and must not leak into the grid. Upload mode still reads the input.
describe('effectiveCell', () => {
  it('takes the cell from the registry entry in tileset mode', () => {
    expect(effectiveCell('tileset', 'buildings/5_Floor_Modular_Buildings_32x32', 7)).toBe(32)
  })

  it('falls back to the first tileset when the name is unknown', () => {
    expect(effectiveCell('tileset', 'nope/not-a-sheet', 7)).toBe(TILESETS[0].cell)
  })

  it('takes the admin Cell input in upload mode', () => {
    expect(effectiveCell('upload', 'buildings/5_Floor_Modular_Buildings_32x32', 7)).toBe(7)
  })
})
