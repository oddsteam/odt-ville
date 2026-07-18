// A source-document fixture that drives the bake pipeline end-to-end without an
// editor UI (issue #80). It is the "painted terrain regions" half of an authored
// map (ADR-0003): a small meadow with a dirt path cutting across grass. Running
// it through the Map Baker produces the persisted { source, baked } document the
// runtime renders.
//
// The catalog here is plain *data* — terrains, their stack order, and the atlas
// coordinates of their art — so adding a terrain is a data edit, not a code
// change (the autotile engine reads it as-is). It references the bundled
// terrain/1_Terrains_and_Fences_32x32 sheet (32 columns).

import { makeCatalog } from '../../kernel/tileCatalog.ts'
import type { TileCatalog } from '../../kernel/tileCatalog.ts'
import type { SourceMap } from '../../kernel/baker.ts'

const SHEET = 'terrain/1_Terrains_and_Fences_32x32'

// road (opaque base) < dirt < grass (top, owns seams). grass + dirt autotile.
// Art coordinates are illustrative atlas cells on the bundled terrain sheet.
export const MEADOW_CATALOG: TileCatalog = makeCatalog(
  [{ type: 'road' }, { type: 'dirt', autotiled: true }, { type: 'grass', autotiled: true }],
  {
    tilesets: [{ name: SHEET, cell: 32, cols: 32 }],
    tiles: [
      { tile_type: 'road', tileset: SHEET, col: 0, row: 0, role: 'fill', side: null },
      { tile_type: 'dirt', tileset: SHEET, col: 1, row: 0, role: 'fill', side: null },
      { tile_type: 'grass', tileset: SHEET, col: 2, row: 0, role: 'fill', side: null },
      // grass transitions onto lower terrain — the four sides + four corners.
      { tile_type: 'grass', tileset: SHEET, col: 1, row: 1, role: 'edge', side: 'N' },
      { tile_type: 'grass', tileset: SHEET, col: 2, row: 1, role: 'edge', side: 'S' },
      { tile_type: 'grass', tileset: SHEET, col: 0, row: 2, role: 'edge', side: 'W' },
      { tile_type: 'grass', tileset: SHEET, col: 2, row: 2, role: 'edge', side: 'E' },
      { tile_type: 'grass', tileset: SHEET, col: 0, row: 1, role: 'corner', side: 'NW' },
      { tile_type: 'grass', tileset: SHEET, col: 3, row: 1, role: 'corner', side: 'NE' },
      { tile_type: 'grass', tileset: SHEET, col: 3, row: 2, role: 'corner', side: 'SE' },
      { tile_type: 'grass', tileset: SHEET, col: 0, row: 3, role: 'corner', side: 'SW' },
    ],
  },
)

const G = 'grass'
const D = 'dirt'

// 5×4 grass field with a horizontal dirt path on the third row.
export const MEADOW_SOURCE: SourceMap = {
  slug: 'meadow',
  title: 'The Meadow',
  cols: 5,
  rows: 4,
  terrain: [
    [G, G, G, G, G],
    [G, G, G, G, G],
    [D, D, D, D, D],
    [G, G, G, G, G],
  ],
}
