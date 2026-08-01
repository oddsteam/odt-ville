import { useCallback, useEffect, useRef, useState } from 'react'
import { floodSelect, viewToSourcePixel } from './foreground.ts'

// Foreground-mask authoring (#36/#50/#51) — paint over the building art which
// pixels render in front of the avatar. Two offscreen canvases: the art
// (source, for the wand's colour reads) and the mask (magenta where painted;
// its alpha is what ships and drives the in-game mask). `tick` forces a redraw
// since both are mutated imperatively. The mask canvas belongs to TileMapper —
// it is what save reads — so it comes in by ref. Split out in #353.

const HISTORY_CAP = 30 // undo depth (#50). ponytail: cap, raise if authors hit it.

export default function ForegroundEditor({
  buildSource, loaded, maskRef,
}: {
  buildSource: () => HTMLCanvasElement | null // the art at native resolution
  loaded: string | null // a saved mask to restore, as a data URL
  maskRef: React.RefObject<HTMLCanvasElement | null>
}) {
  const [tool, setTool] = useState<'brush' | 'wand' | 'erase'>('wand')
  const [size, setSize] = useState(8) // brush/eraser radius, in source px
  const [tol, setTol] = useState(24) // wand colour tolerance
  const [tick, setTick] = useState(0)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [history, setHistory] = useState<ImageData[]>([])
  const srcRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)

  // Build/refresh the source + mask canvases when the editor opens or the art
  // changes; restore a loaded mask onto the (matching-size) mask canvas.
  useEffect(() => {
    const src = buildSource()
    if (!src) return
    srcRef.current = src
    let mask = maskRef.current
    if (!mask || mask.width !== src.width || mask.height !== src.height) {
      mask = document.createElement('canvas')
      mask.width = src.width
      mask.height = src.height
      maskRef.current = mask
      setHistory([]) // art changed → can't undo past this baseline (#50)
      if (loaded) {
        const img = new Image()
        img.onload = () => {
          mask!.getContext('2d')!.drawImage(img, 0, 0, mask!.width, mask!.height)
          setTick((t) => t + 1)
        }
        img.src = loaded
      }
    }
    setTick((t) => t + 1)
  }, [buildSource, loaded, maskRef])

  // Redraw the scaled view: the building art with the painted mask tinted over it.
  useEffect(() => {
    const view = viewRef.current
    const src = srcRef.current
    const mask = maskRef.current
    if (!view || !src || !mask) return
    const zoom = Math.max(1, Math.min(6, Math.floor(480 / src.width)))
    view.width = src.width * zoom
    view.height = src.height * zoom
    const ctx = view.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, view.width, view.height)
    ctx.drawImage(src, 0, 0, view.width, view.height)
    ctx.globalAlpha = 0.5
    ctx.drawImage(mask, 0, 0, view.width, view.height)
    ctx.globalAlpha = 1
    // Live cursor (#51): the disc the brush/eraser will paint (centred on the
    // same source pixel `stamp` uses), or a crosshair for the wand's seed pixel.
    if (cursor) {
      const cx = cursor.x * zoom
      const cy = cursor.y * zoom
      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (tool === 'wand') {
        ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy)
        ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6)
      } else {
        ctx.arc(cx, cy, size * zoom, 0, Math.PI * 2)
      }
      ctx.stroke()
    }
  }, [tick, cursor, tool, size, maskRef])

  // Mouse → source-pixel coords on the view canvas.
  function pixelAt(e: React.MouseEvent<HTMLCanvasElement>) {
    const view = viewRef.current!
    const src = srcRef.current!
    const rect = view.getBoundingClientRect()
    return viewToSourcePixel(
      e.clientX, e.clientY, rect,
      { left: view.clientLeft, top: view.clientTop },
      { width: view.clientWidth, height: view.clientHeight },
      src.width, src.height,
    )
  }
  // Brush/eraser: a filled disc on the mask (magenta, or punched out to erase).
  function stamp(x: number, y: number) {
    const ctx = maskRef.current!.getContext('2d')!
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over'
    ctx.fillStyle = 'rgba(255,0,255,1)'
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
  // Magic wand: flood the source by colour, paint that run onto the mask.
  function wand(x: number, y: number) {
    const src = srcRef.current!
    const mask = maskRef.current!
    const sdata = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data
    const region = floodSelect(sdata, src.width, src.height, x, y, tol)
    const mctx = mask.getContext('2d')!
    const md = mctx.getImageData(0, 0, mask.width, mask.height)
    for (const i of region) {
      const p = i * 4
      md.data[p] = 255
      md.data[p + 1] = 0
      md.data[p + 2] = 255
      md.data[p + 3] = 255
    }
    mctx.putImageData(md, 0, 0)
  }
  // Snapshot the mask before an action so undo can restore it (#50). One push
  // per action — onDown only — makes a stroke or a wand fill a single step.
  function pushHistory() {
    const mask = maskRef.current!
    const snap = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height)
    setHistory((h) => [...h, snap].slice(-HISTORY_CAP))
  }
  const onUndo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h
      const mask = maskRef.current
      if (mask) mask.getContext('2d')!.putImageData(h[h.length - 1], 0, 0)
      return h.slice(0, -1)
    })
    setTick((t) => t + 1)
  }, [maskRef])
  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!srcRef.current || !maskRef.current) return
    pushHistory()
    drawingRef.current = true
    const { x, y } = pixelAt(e)
    tool === 'wand' ? wand(x, y) : stamp(x, y)
    setTick((t) => t + 1)
  }
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!srcRef.current) return
    const { x, y } = pixelAt(e)
    setCursor({ x, y })
    if (!drawingRef.current || tool === 'wand') return
    stamp(x, y)
    setTick((t) => t + 1)
  }
  function onUp() {
    drawingRef.current = false
  }

  // Cmd/Ctrl+Z undoes while the editor is open (#50).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        onUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onUndo])

  return (
    <div className="fg-editor">
      <p className="hint">
        Mark the house pixels that render <strong>in front of</strong> the avatar (foliage, eaves).
        Wand = flood-select by colour; Brush/Eraser = freehand.
      </p>
      <div className="fg-tools">
        {(['wand', 'brush', 'erase'] as const).map((t) => (
          <button key={t} type="button" className={tool === t ? 'is-on' : ''} onClick={() => setTool(t)}>
            {t === 'wand' ? 'Wand' : t === 'brush' ? 'Brush' : 'Eraser'}
          </button>
        ))}
        {tool === 'wand' ? (
          <label>
            Tolerance
            <input type="number" min={0} max={255} value={tol}
              onChange={(e) => setTol(Math.max(0, Math.min(255, Number(e.target.value) || 0)))} style={{ width: 56 }} />
          </label>
        ) : (
          <label>
            Size
            <input type="number" min={1} max={64} value={size}
              onChange={(e) => setSize(Math.max(1, Math.min(64, Number(e.target.value) || 1)))} style={{ width: 56 }} />
          </label>
        )}
        <button type="button" onClick={onUndo} disabled={history.length === 0} title="Undo (⌘/Ctrl+Z)">
          Undo
        </button>
      </div>
      <canvas ref={viewRef} className="fg-canvas" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { onUp(); setCursor(null) }} />
    </div>
  )
}
