// Composing object art from tileset parts (#353). A modular pack ships a ground
// floor, a repeating middle floor and a roof — never a finished building. The
// composition is a sparse grid of tiles: composition cell "c,r" → the source
// tileset cell it draws. One tile per cell, replaced on restamp; stacking is
// explicit and lands in #354.

export type Block = { c: number; r: number; w: number; h: number } // source cells
export type Cell = { c: number; r: number }
export type Placed = ReadonlyMap<string, readonly [number, number]> // "c,r" → [srcCol, srcRow]
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
            [block.c + dc, block.r + dr],
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

// The inclusive bounding box of the placed tiles — the composed art's extent,
// and the default footprint_w/footprint_h. Null while nothing is placed.
export function bounds(placed: Placed): Bounds | null {
  if (!placed.size) return null
  const cs: number[] = []
  const rs: number[] = []
  for (const key of placed.keys()) {
    const [c, r] = key.split(',').map(Number)
    cs.push(c)
    rs.push(r)
  }
  const c = Math.min(...cs)
  const r = Math.min(...rs)
  return { c, r, w: Math.max(...cs) - c + 1, h: Math.max(...rs) - r + 1 }
}

// Flatten the composition onto a context sized `box.w`×`box.h` cells, drawing
// each placed tile from the source sheet. At save this becomes the standalone
// PNG the object ships — the game never sees the tileset (ADR-0014).
export function flatten(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  placed: Placed,
  cell: number,
  box: Bounds,
): void {
  ctx.imageSmoothingEnabled = false
  for (const [key, [sc, sr]] of placed) {
    const [c, r] = key.split(',').map(Number)
    ctx.drawImage(img, sc * cell, sr * cell, cell, cell, (c - box.c) * cell, (r - box.r) * cell, cell, cell)
  }
}
