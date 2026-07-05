// Pure grid ops for the editor's collision mask (#131). The mask is a row-major
// `mask[y][x]` boolean grid the same size as the map: `true` = a blocked cell the
// runtime vetoes walkability on. It is not terrain and not a Placed Entity — it
// only blocks — so it lives on its own grid, independent of the paint tools, and
// works identically on painted and Tiled maps. All ops return a fresh grid
// (immutable React state); undefined-heavy so a legacy map with no mask is fine.

export type Mask = ReadonlyArray<ReadonlyArray<boolean>>

// A rows×cols grid with nothing masked.
export function makeMask(cols: number, rows: number): Mask {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
}

// Set one cell blocked/clear (paint vs erase); out-of-bounds is a no-op.
export function setMaskCell(mask: Mask, x: number, y: number, blocked: boolean): Mask {
  if (y < 0 || y >= mask.length || x < 0 || x >= (mask[0]?.length ?? 0)) return mask
  return mask.map((row, ry) => (ry === y ? row.map((c, rx) => (rx === x ? blocked : c)) : row))
}

// Resize to cols×rows, keeping cells that still fit and clearing the rest.
export function resizeMask(mask: Mask, cols: number, rows: number): Mask {
  return Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => mask[y]?.[x] ?? false),
  )
}

// Is nothing masked? The editor omits an all-false mask from the saved document
// so a map with no collision stays clean (and the runtime falls back to the
// in-bounds rule).
export function isMaskEmpty(mask: Mask): boolean {
  return mask.every((row) => row.every((c) => !c))
}
