// Mini map geometry (pure): a corner box scaled from the map's tile grid, one
// dot per person. The Phaser overlay in MapScene owns the rendering; this owns
// the arithmetic so the scaling has a test.

const MAX_SIDE = 120
const MAX_CELL = 8

export function miniMapLayout(cols: number, rows: number) {
  const cell = Math.min(MAX_CELL, Math.floor(MAX_SIDE / Math.max(cols, rows)))
  return { width: cell * cols, height: cell * rows, cell }
}

export function miniMapDot(tile: { x: number; y: number }, cell: number) {
  return { x: (tile.x + 0.5) * cell, y: (tile.y + 0.5) * cell }
}
