// Frame-strip import for the Tile-Object Mapper (#436, ADR-0019). An animated
// object's art is the uploaded PNG stored verbatim — a horizontal strip of
// equal frames — so the only number to get right is how many frames it holds,
// and that is the strip's own width divided by one frame's width. Never typed:
// a hand-entered frame count that disagrees with the art shreds the animation.

export type StripImport = { ok: true; frameCount: number } | { ok: false; message: string }

// frame_count = imageWidth / (footprint_w × cell). A width that isn't an exact
// multiple is rejected, not rounded — a rounded count slices every frame at the
// wrong offset, which reads as "the art is broken" rather than "the import is".
export function deriveFrameCount(imageWidth: number, footprintW: number, cell: number): StripImport {
  const frameW = footprintW * cell
  const frameCount = imageWidth / frameW
  if (!Number.isInteger(frameCount) || frameCount < 1)
    return {
      ok: false,
      message:
        `That strip is ${imageWidth}px wide — not a whole number of ${frameW}px frames ` +
        `(footprint ${footprintW} × cell ${cell}px). Fix the footprint width or the cell size.`,
    }
  return { ok: true, frameCount }
}
