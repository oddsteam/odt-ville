// Composing object art from tileset parts (#353). A modular pack ships a ground
// floor, a repeating middle floor and a roof — never a finished building. A
// layer is a sparse grid of tiles: composition cell "c,r" → the source tileset
// cell it draws. One tile per cell per layer, replaced on restamp; stacking is
// explicit — a second layer puts a sign over a wall (#354), and the stack
// flattens bottom-up into the art.

// Every placed cell carries the sheet it came from, so a wall from the modular
// buildings pack and a sign from the props pack can live in one composition —
// switching the tileset picks the next block, it doesn't invalidate the art.
// (Every registry sheet is 32 px per cell; a mixed-cell composition isn't a
// case the grid supports.)
export type Block = { c: number; r: number; w: number; h: number; sheet: string } // source cells
export type Cell = { c: number; r: number }
export type Placed = ReadonlyMap<string, readonly [number, number, string]> // "c,r" → [srcCol, srcRow, sheet]
export type Bounds = { c: number; r: number; w: number; h: number }

// Stamp the picked block along a drag, stepping a whole block at a time — so a
// 12-storey tower costs the same drag as a 3-storey one. A click is a drag that
// never left its anchor, hence one block. Repeats run *away from the anchor*,
// not from the rectangle's top-left, so dragging a floor upwards keeps every
// copy aligned to the floor you started on.
export function repeat(placed: Placed, block: Block, from: Cell, to: Cell): Placed {
  const next = new Map(placed)
  const sc = to.c >= from.c ? 1 : -1
  const sr = to.r >= from.r ? 1 : -1
  const nc = Math.floor(Math.abs(to.c - from.c) / block.w)
  const nr = Math.floor(Math.abs(to.r - from.r) / block.h)
  for (let i = 0; i <= nc; i++)
    for (let j = 0; j <= nr; j++)
      for (let dr = 0; dr < block.h; dr++)
        for (let dc = 0; dc < block.w; dc++)
          next.set(
            `${from.c + sc * i * block.w + dc},${from.r + sr * j * block.h + dr}`,
            [block.c + dc, block.r + dr, block.sheet],
          )
  return next
}

// Clear every cell in the dragged rectangle — the composition-side eraser.
export function erase(placed: Placed, from: Cell, to: Cell): Placed {
  const next = new Map(placed)
  for (let r = Math.min(from.r, to.r); r <= Math.max(from.r, to.r); r++)
    for (let c = Math.min(from.c, to.c); c <= Math.max(from.c, to.c); c++) next.delete(`${c},${r}`)
  return next
}

// Does this stamp land on cells the layer already fills? Drives the "replaced —
// use + Layer to stack instead" hint (#354), which is the whole point of saying
// it: replacing is the default, stacking is one click away.
export function overlaps(placed: Placed, block: Block, from: Cell, to: Cell): boolean {
  for (const key of repeat(new Map(), block, from, to).keys()) if (placed.has(key)) return true
  return false
}

// The inclusive bounding box of every layer's tiles — the composed art's extent,
// and the default footprint_w/footprint_h. Null while nothing is placed.
export function bounds(layers: readonly Placed[]): Bounds | null {
  const cs: number[] = []
  const rs: number[] = []
  for (const placed of layers)
    for (const key of placed.keys()) {
      const [c, r] = key.split(',').map(Number)
      cs.push(c)
      rs.push(r)
    }
  if (!cs.length) return null
  const c = Math.min(...cs)
  const r = Math.min(...rs)
  return { c, r, w: Math.max(...cs) - c + 1, h: Math.max(...rs) - r + 1 }
}

// Flatten the composition onto a context sized `box.w`×`box.h` cells, drawing
// each placed tile from its own sheet, layers bottom-up so the sign lands on the
// wall. A cell whose sheet isn't loaded is skipped rather than drawn from the
// wrong image. At save this becomes the standalone PNG the object ships — the
// game never sees the tilesets, or the layers (ADR-0014).
export function flatten(
  ctx: CanvasRenderingContext2D,
  sheets: ReadonlyMap<string, CanvasImageSource>,
  layers: readonly Placed[],
  cell: number,
  box: Bounds,
): void {
  ctx.imageSmoothingEnabled = false
  for (const placed of layers)
    for (const [key, [sc, sr, sheet]] of placed) {
      const img = sheets.get(sheet)
      if (!img) continue
      const [c, r] = key.split(',').map(Number)
      ctx.drawImage(img, sc * cell, sr * cell, cell, cell, (c - box.c) * cell, (r - box.r) * cell, cell, cell)
    }
}
