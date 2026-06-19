// Real object art extracted from the Modern Exteriors pack (see assets/tiles/).
// Tall props are drawn over the existing generated ground; trees replace the
// boundary 'T' tiles. The town layout (buildTown in constants.js) is untouched,
// so this scales automatically as admins add houses.
//
// (A ground-tile reskin was tried and reverted — the pack's grass/paths need
// proper autotiling to look right, so ground still uses tileTextures.js.)

// Glob (not static import) so a missing PNG never breaks the Vite build.
const url = (glob) => Object.values(glob)[0] || null
const treeUrl = url(import.meta.glob('../assets/tiles/tree.png', { eager: true, query: '?url', import: 'default' }))

// Tall props: bottom-anchored, y-sorted sprites drawn over the ground. wTiles/
// hTiles are the on-grid footprint; `blocks` adds collision (boundary trees
// already sit on blocked 'T' tiles, so they don't need it).
export const PROPS = treeUrl
  ? { 'prop.tree': { key: 'prop.tree', url: treeUrl, wTiles: 1.4, hTiles: 1.8, blocks: false } }
  : {}

// On once the tree art is present.
export const ENABLED = Boolean(treeUrl)

// Deterministic placement: a tree on every boundary 'T' tile, turning the map
// edge into a tree line. Pure function of the grid, so rows added as the town
// grows get trees automatically. Returns [{ key, col, row }].
export function tallPropsFor(town) {
  if (!PROPS['prop.tree']) return []
  const out = []
  for (let y = 0; y < town.rows; y++) {
    for (let x = 0; x < town.cols; x++) {
      if (town.map[y][x] === 'T') out.push({ key: 'prop.tree', col: x, row: y })
    }
  }
  return out
}
