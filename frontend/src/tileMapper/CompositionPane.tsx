import { useEffect, useRef, useState } from 'react'
import {
  erase as eraseCells, overlaps, repeat, sameBlock,
  type Block, type Bounds, type Cell, type Placed,
} from './composition.ts'

// The composition board (#353) — the middle column of the Tile-Object Mapper.
// The rectangle picked on the tileset is the block; clicking here stamps it and
// dragging repeats it a whole block at a time, so a 12-storey tower costs the
// same drag as a 3-storey one. Stamps land on the active layer, so a sign can
// sit over a wall (#354). The board owns its tool + pointer handling; the
// layer stack itself lives in TileMapper, which needs it for save and preview.

// A fixed 24×24-cell board — room for a 12-storey tower of two-tile floors.
// ponytail: fixed board, no pan/resize; widen the constant if authors run out.
const COMP_CELLS = 24

// The recent-blocks strip (#356) — thumbnails of the last dozen picks, so the
// tenth shop off one style block doesn't cost a tenth hunt through the sheet.
// Drawn as a scaled background crop of the source sheet: no canvas, no effect.
const THUMB = 34 // px, the strip's row height

function thumbStyle(b: Block, img: HTMLImageElement | undefined, cell: number): React.CSSProperties {
  if (!img) return { width: THUMB, height: THUMB } // sheet not loaded this session
  const s = THUMB / (Math.max(b.w, b.h) * cell)
  return {
    width: b.w * cell * s,
    height: b.h * cell * s,
    backgroundImage: `url("${img.src}")`, // quoted: an uploaded sheet's src is a data URL
    backgroundSize: `${img.naturalWidth * s}px ${img.naturalHeight * s}px`,
    backgroundPosition: `-${b.c * cell * s}px -${b.r * cell * s}px`,
  }
}

export default function CompositionPane({
  sheets, cell, block, recent, placed, layerCount, active, box, composed,
  onChange, onClear, onAddLayer, onPickLayer, onCommit, onNeedBlock, onPickRecent, onDropRecent,
}: {
  sheets: ReadonlyMap<string, HTMLImageElement> // every sheet loaded this session
  cell: number
  block: Block | null // the picked tileset rectangle
  recent: readonly Block[] // the strip, newest first
  placed: Placed // the active layer — what stamps and erases touch
  layerCount: number
  active: number
  box: Bounds | null
  composed: HTMLCanvasElement | null
  onChange: (next: Placed) => void
  onClear: () => void // drop the whole stack back to one empty layer
  onAddLayer: () => void
  onPickLayer: (i: number) => void
  onCommit: (replaced: boolean) => void // a stamp/erase drag finished
  onNeedBlock: () => void // tried to stamp with nothing picked
  onPickRecent: (block: Block) => void // a strip thumbnail became the active block
  onDropRecent: (block: Block) => void // a thumbnail's × — drop it from the strip
}) {
  const [tool, setTool] = useState<'stamp' | 'erase'>('stamp')
  const [hover, setHover] = useState<Cell | null>(null) // drives the stamp ghost
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ anchor: Cell; base: Placed; to: Cell } | null>(null)
  const zoom = Math.max(1, Math.round(32 / cell)) // ~32 px per cell, whole-number
  const step = cell * zoom

  // Draw the flattened art at its board position, over a cell grid.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = COMP_CELLS * step
    canvas.height = COMP_CELLS * step
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (composed && box)
      ctx.drawImage(composed, box.c * step, box.r * step, box.w * step, box.h * step)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    for (let i = 0; i <= COMP_CELLS; i++) {
      ctx.beginPath()
      ctx.moveTo(i * step + 0.5, 0)
      ctx.lineTo(i * step + 0.5, canvas.height)
      ctx.moveTo(0, i * step + 0.5)
      ctx.lineTo(canvas.width, i * step + 0.5)
      ctx.stroke()
    }

    // The stamp ghost under the cursor — the block's own art at 55%, or a white
    // cell for the eraser, boxed in white. Same language as the map decorator's
    // footprint ghost (#144). Pure presentation; it never enters the
    // composition. Hidden mid-drag, where the real placement already shows.
    const w = tool === 'erase' ? 1 : (block?.w ?? 0)
    const h = tool === 'erase' ? 1 : (block?.h ?? 0)
    if (!hover || dragRef.current || !w) return
    const x = hover.c * step
    const y = hover.r * step
    ctx.globalAlpha = 0.55
    // The ghost is drawn from the block's *own* sheet, not the sheet on screen —
    // a block pinned off the strip may come from a tileset the author has since
    // switched away from (#356).
    const img = block && sheets.get(block.sheet)
    if (tool === 'erase' || !img) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, w * step, h * step)
    } else {
      ctx.drawImage(img, block!.c * cell, block!.r * cell, w * cell, h * cell, x, y, w * step, h * step)
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, w * step - 2, h * step - 2)
  }, [composed, box, step, hover, tool, block, sheets, cell])

  // A click is a zero-length drag, so stamp and repeat-drag share one path: down
  // anchors, move re-runs the whole action against the pre-drag composition (so
  // dragging back shrinks the repeat rather than piling copies up), up ends it.
  function cellAt(e: React.MouseEvent<HTMLCanvasElement>): Cell {
    const rect = canvasRef.current!.getBoundingClientRect()
    const clamp = (v: number) => Math.max(0, Math.min(COMP_CELLS - 1, Math.floor(v / step)))
    return { c: clamp(e.clientX - rect.left), r: clamp(e.clientY - rect.top) }
  }
  function apply(base: Placed, anchor: Cell, to: Cell): Placed {
    if (tool === 'erase') return eraseCells(base, anchor, to)
    return block ? repeat(base, block, anchor, to) : base
  }
  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!sheets.size) return
    if (tool === 'stamp' && !block) {
      onNeedBlock()
      return
    }
    const anchor = cellAt(e)
    dragRef.current = { anchor, base: placed, to: anchor }
    onChange(apply(placed, anchor, anchor))
  }
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const at = cellAt(e)
    setHover(at)
    const drag = dragRef.current
    if (!drag) return
    drag.to = at
    onChange(apply(drag.base, drag.anchor, at))
  }
  function onUp() {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    // Stamping over occupied cells replaced them rather than stacking — the
    // status line says so and offers the layer (#354).
    onCommit(tool === 'stamp' && !!block && overlaps(drag.base, block, drag.anchor, drag.to))
  }

  return (
    <div className="mid">
      <div className="comp-tools">
        <span>Composition</span>
        <button type="button" className={tool === 'stamp' ? 'is-on' : ''} onClick={() => setTool('stamp')}>
          Stamp
        </button>
        <button type="button" className={tool === 'erase' ? 'is-on' : ''} onClick={() => setTool('erase')}>
          Eraser
        </button>
        {/* Clear is the whole composition, not just the active layer — it's how
            an author starts the next object. */}
        <button type="button" onClick={onClear} disabled={!box}>
          Clear
        </button>
        {/* One layer is the common case, so the picker only appears once there
            are two to choose between (#354). Layer 1 is the bottom of the stack. */}
        <button type="button" onClick={onAddLayer}>+ Layer</button>
        {layerCount > 1 && (
          <select value={active} onChange={(e) => onPickLayer(Number(e.target.value))}>
            {Array.from({ length: layerCount }, (_, i) => (
              <option key={i} value={i}>Layer {i + 1}</option>
            ))}
          </select>
        )}
      </div>
      <p className="hint">
        {block
          ? `Block ${block.w}×${block.h} — click to stamp it, drag to repeat it along the drag.`
          : 'Drag a rectangle on the tileset to pick a block, then stamp it here.'}
        {box && ` ${box.w}×${box.h} tiles placed.`}
        {layerCount > 1 && ` Stamping on layer ${active + 1} of ${layerCount}.`}
      </p>
      {recent.length > 0 && (
        <div className="recent-strip">
          {recent.map((b) => (
            // The × sits in the thumb's own corner rather than over its art, so
            // a one-click drop doesn't cost the block's top-right tile.
            <div className="recent-thumb" key={`${b.sheet}:${b.c},${b.r},${b.w},${b.h}`}>
              <button
                type="button"
                className={`pick${block && sameBlock(b, block) ? ' is-on' : ''}`}
                title={`${b.w}×${b.h} from ${b.sheet}`}
                onClick={() => onPickRecent(b)}
              >
                <span style={thumbStyle(b, sheets.get(b.sheet), cell)} />
              </button>
              <button
                type="button"
                className="drop"
                title="Drop this block from the strip"
                aria-label={`Drop the ${b.w}×${b.h} block from ${b.sheet}`}
                onClick={() => onDropRecent(b)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="comp-wrap">
        <canvas
          ref={canvasRef}
          className="comp-canvas"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={() => { onUp(); setHover(null) }}
        />
      </div>
    </div>
  )
}
