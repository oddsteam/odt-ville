import { useEffect, useRef, useState } from 'react'
import { erase as eraseCells, repeat, type Block, type Bounds, type Cell, type Placed } from './composition.ts'

// The composition board (#353) — the middle column of the Tile-Object Mapper.
// The rectangle picked on the tileset is the block; clicking here stamps it and
// dragging repeats it a whole block at a time, so a 12-storey tower costs the
// same drag as a 3-storey one. The board owns its tool + pointer handling; the
// composition itself lives in TileMapper, which needs it for save and preview.

// A fixed 24×24-cell board — room for a 12-storey tower of two-tile floors.
// ponytail: fixed board, no pan/resize; widen the constant if authors run out.
const COMP_CELLS = 24

export default function CompositionPane({
  sheet, cell, block, placed, box, composed, onChange, onCommit, onNeedBlock,
}: {
  sheet: HTMLImageElement | null // the source tileset, for drawing the stamp ghost
  cell: number
  block: Block | null // the picked tileset rectangle
  placed: Placed
  box: Bounds | null
  composed: HTMLCanvasElement | null
  onChange: (next: Placed) => void
  onCommit: () => void // a stamp/erase drag finished
  onNeedBlock: () => void // tried to stamp with nothing picked
}) {
  const [tool, setTool] = useState<'stamp' | 'erase'>('stamp')
  const [hover, setHover] = useState<Cell | null>(null) // drives the stamp ghost
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ anchor: Cell; base: Placed } | null>(null)
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
    if (tool === 'erase' || !sheet) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, w * step, h * step)
    } else {
      ctx.drawImage(sheet, block!.c * cell, block!.r * cell, w * cell, h * cell, x, y, w * step, h * step)
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, w * step - 2, h * step - 2)
  }, [composed, box, step, hover, tool, block, sheet, cell])

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
    if (!sheet) return
    if (tool === 'stamp' && !block) {
      onNeedBlock()
      return
    }
    const anchor = cellAt(e)
    dragRef.current = { anchor, base: placed }
    onChange(apply(placed, anchor, anchor))
  }
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const at = cellAt(e)
    setHover(at)
    const drag = dragRef.current
    if (drag) onChange(apply(drag.base, drag.anchor, at))
  }
  function onUp() {
    if (!dragRef.current) return
    dragRef.current = null
    onCommit()
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
        <button type="button" onClick={() => onChange(new Map())} disabled={placed.size === 0}>
          Clear
        </button>
      </div>
      <p className="hint">
        {block
          ? `Block ${block.w}×${block.h} — click to stamp it, drag to repeat it along the drag.`
          : 'Drag a rectangle on the tileset to pick a block, then stamp it here.'}
        {box && ` ${box.w}×${box.h} tiles placed.`}
      </p>
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
