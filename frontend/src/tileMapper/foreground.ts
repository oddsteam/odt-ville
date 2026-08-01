// The foreground-mask editor's pixel work (#36/#50/#51) — flood select, the
// view→source mapping the brush needs, and the has-anything-been-painted check.
// Split out of TileMapper.tsx in #353.

// Magic-wand select (#36): the 4-connected run of pixels whose colour is within
// `tolerance` (max per-channel abs diff, alpha included) of the seed pixel.
// Returns pixel indices (y*width + x). Pure over an RGBA buffer so it's unit-
// testable without a canvas; the foreground editor feeds it getImageData().
export function floodSelect(
  data: Uint8ClampedArray, width: number, height: number, sx: number, sy: number, tolerance: number,
): number[] {
  const at = (x: number, y: number) => y * width + x
  const s = at(sx, sy) * 4
  const within = (p: number) =>
    Math.abs(data[p] - data[s]) <= tolerance &&
    Math.abs(data[p + 1] - data[s + 1]) <= tolerance &&
    Math.abs(data[p + 2] - data[s + 2]) <= tolerance &&
    Math.abs(data[p + 3] - data[s + 3]) <= tolerance
  const seen = new Uint8Array(width * height)
  const out: number[] = []
  const stack: Array<[number, number]> = [[sx, sy]]
  seen[at(sx, sy)] = 1
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (!within(at(x, y) * 4)) continue
    out.push(at(x, y))
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[at(nx, ny)]) continue
      seen[at(nx, ny)] = 1
      stack.push([nx, ny])
    }
  }
  return out
}

// Mouse → source-pixel on the foreground view canvas (#51). getBoundingClientRect
// is the *border* box, so shift past the border and scale by the *content* box,
// not the border box — otherwise the brush lands offset from the cursor when the
// canvas is CSS-scaled to fit and carries a 1px border. Clamped to the source.
export function viewToSourcePixel(
  clientX: number, clientY: number,
  rect: { left: number; top: number },
  border: { left: number; top: number },
  content: { width: number; height: number },
  srcW: number, srcH: number,
): { x: number; y: number } {
  const x = Math.floor(((clientX - rect.left - border.left) / content.width) * srcW)
  const y = Math.floor(((clientY - rect.top - border.top) / content.height) * srcH)
  return {
    x: Math.max(0, Math.min(srcW - 1, x)),
    y: Math.max(0, Math.min(srcH - 1, y)),
  }
}

// True if a mask canvas has any painted (non-transparent) pixel — so we only
// ship a foreground mask (#36) when the admin actually authored one.
export function maskHasInk(c: HTMLCanvasElement | null): boolean {
  if (!c) return false
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true
  return false
}
