// Map a pointer event over the WYSIWYG bake preview to the tile beneath it
// (#143) — so a click on the preview stamps/erases a prop where the cursor is,
// replacing the abstract placement grid. `getBoundingClientRect` already folds
// in the column's (and page's) scroll offset, and dividing the canvas's native
// pixel size by its displayed size folds in any CSS scale — so the cursor lands
// on the right cell even on a large map that overflows and scrolls, or a shrunk
// preview. Pure: the caller measures the live rect + canvas and passes them in.
export function tileFromPointer(
  pointer: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  canvas: { width: number; height: number },
  tile: number,
): { x: number; y: number } {
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const px = (pointer.clientX - rect.left) * sx
  const py = (pointer.clientY - rect.top) * sy
  return { x: Math.floor(px / tile), y: Math.floor(py / tile) }
}

// Bound a resolved tile to the map plus an interactive gutter of `gutter`
// tiles past every edge (#347) — so a pointer in the gutter names an off-map
// anchor (negative, or ≥ cols/rows) for edge-overhanging placement, while a
// gutter of 0 keeps dropping every out-of-map tile (collision/zones/NPCs).
export function tileWithinGutter(
  t: { x: number; y: number },
  bounds: { cols: number; rows: number },
  gutter: number,
): { x: number; y: number } | null {
  return t.x >= -gutter && t.x < bounds.cols + gutter && t.y >= -gutter && t.y < bounds.rows + gutter
    ? t
    : null
}
