// Pure grid ops for the map editor's paint surface (#107). A terrain grid is
// row-major `terrain[y][x]`, matching SourceMap.terrain; a cell is a terrain
// type or null (unpainted). All ops return a fresh grid — the React state is
// immutable, and baking reads whatever the latest grid holds.

export type Terrain = ReadonlyArray<ReadonlyArray<string | null>>

// A rows×cols grid, every cell the same terrain.
export function makeTerrain(cols: number, rows: number, fill: string | null): Terrain {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill))
}

// Paint one cell; out-of-bounds is a no-op (returns the input unchanged).
export function paintCell(terrain: Terrain, x: number, y: number, type: string | null): Terrain {
  if (y < 0 || y >= terrain.length || x < 0 || x >= (terrain[0]?.length ?? 0)) return terrain
  return terrain.map((row, ry) => (ry === y ? row.map((c, rx) => (rx === x ? type : c)) : row))
}

// Fill the inclusive rectangle spanned by two corners (any drag direction),
// clamped to the grid.
export function paintRect(
  terrain: Terrain,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  type: string | null,
): Terrain {
  const cols = terrain[0]?.length ?? 0
  const lo = (v: number, max: number) => Math.max(0, Math.min(v, max))
  const minX = lo(Math.min(x0, x1), cols - 1)
  const maxX = lo(Math.max(x0, x1), cols - 1)
  const minY = lo(Math.min(y0, y1), terrain.length - 1)
  const maxY = lo(Math.max(y0, y1), terrain.length - 1)
  return terrain.map((row, y) =>
    y < minY || y > maxY ? row : row.map((c, x) => (x >= minX && x <= maxX ? type : c)),
  )
}

// Resize to cols×rows, keeping cells that still fit and filling the rest.
export function resizeTerrain(terrain: Terrain, cols: number, rows: number, fill: string | null): Terrain {
  return Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => terrain[y]?.[x] ?? fill),
  )
}
