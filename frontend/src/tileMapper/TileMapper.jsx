import { useCallback, useEffect, useRef, useState } from 'react'
import { saveTileObject } from '../tileObjects/client.js'
import './styles.css'

// Tile-Object Mapper — admins upload an atlas PNG, drag a rectangle over the
// cell grid to select a whole object (a tree, a prop), then save it. The
// browser crops that region to a standalone PNG (data URL) so the game just
// draws one image; the atlas never has to ship to the game. See the Rails
// tile_objects API + TownScene's tall-prop overlay.

const MAP_TILE = 48 // px per tile in the game — used to preview real map size.

export default function TileMapper() {
  const [atlas, setAtlas] = useState(null) // { img, src, width, height }
  const [cell, setCell] = useState(16)
  const [zoom, setZoom] = useState(3)
  const [sel, setSel] = useState(null) // { c0, r0, c1, r1 } inclusive cell range
  const [name, setName] = useState('tree')
  const [kind, setKind] = useState('tree')
  const [fpW, setFpW] = useState(1.4)
  const [fpH, setFpH] = useState(1.8)
  const [status, setStatus] = useState('Upload an atlas PNG to begin.')

  const canvasRef = useRef(null)
  const dragRef = useRef(null) // { c, r } drag anchor while the mouse is down

  const cols = atlas ? Math.floor(atlas.width / cell) : 0
  const rows = atlas ? Math.floor(atlas.height / cell) : 0

  // Normalized selection in cells (inclusive), or null.
  const selBox = sel
    ? {
        c: Math.min(sel.c0, sel.c1),
        r: Math.min(sel.r0, sel.r1),
        w: Math.abs(sel.c1 - sel.c0) + 1,
        h: Math.abs(sel.r1 - sel.r0) + 1,
      }
    : null

  const onUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        setAtlas({ img, src: reader.result, width: img.naturalWidth, height: img.naturalHeight })
        setSel(null)
        setStatus(`Loaded atlas (${img.naturalWidth}×${img.naturalHeight}). Drag to select an object.`)
      }
      img.onerror = () => setStatus('Could not read that image.')
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }, [])

  // ---- draw the atlas + grid + selection ----------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !atlas) return
    canvas.width = atlas.width * zoom
    canvas.height = atlas.height * zoom
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(atlas.img, 0, 0, canvas.width, canvas.height)

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1
    const step = cell * zoom
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath()
      ctx.moveTo(x * step + 0.5, 0)
      ctx.lineTo(x * step + 0.5, rows * step)
      ctx.stroke()
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * step + 0.5)
      ctx.lineTo(cols * step, y * step + 0.5)
      ctx.stroke()
    }

    // Selection highlight
    if (selBox) {
      ctx.fillStyle = 'rgba(46,125,255,0.25)'
      ctx.strokeStyle = '#2e7dff'
      ctx.lineWidth = 2
      const x = selBox.c * step
      const y = selBox.r * step
      ctx.fillRect(x, y, selBox.w * step, selBox.h * step)
      ctx.strokeRect(x + 1, y + 1, selBox.w * step - 2, selBox.h * step - 2)
    }
  }, [atlas, cell, zoom, cols, rows, selBox])

  // ---- live preview of the cropped object at map scale --------------
  const previewRef = useRef(null)
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !atlas || !selBox) return
    const w = Math.max(1, Math.round(fpW * MAP_TILE))
    const h = Math.max(1, Math.round(fpH * MAP_TILE))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(
      atlas.img,
      selBox.c * cell, selBox.r * cell, selBox.w * cell, selBox.h * cell,
      0, 0, w, h,
    )
  }, [atlas, cell, selBox, fpW, fpH])

  // ---- drag-select on the canvas ------------------------------------
  function cellAt(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const step = cell * zoom
    const c = Math.floor((e.clientX - rect.left) / step)
    const r = Math.floor((e.clientY - rect.top) / step)
    return {
      c: Math.max(0, Math.min(cols - 1, c)),
      r: Math.max(0, Math.min(rows - 1, r)),
    }
  }
  function onDown(e) {
    if (!atlas) return
    const { c, r } = cellAt(e)
    dragRef.current = { c, r }
    setSel({ c0: c, r0: r, c1: c, r1: r })
  }
  function onMove(e) {
    if (!dragRef.current) return
    const { c, r } = cellAt(e)
    setSel({ c0: dragRef.current.c, r0: dragRef.current.r, c1: c, r1: r })
  }
  function onUp() {
    if (!dragRef.current || !selBox) {
      dragRef.current = null
      return
    }
    dragRef.current = null
    // Default the footprint to the selected cell span (1 cell ≈ 1 tile), which
    // the admin can then tune for how big it should read on the map.
    setFpW(selBox.w)
    setFpH(selBox.h)
    setStatus(`Selected ${selBox.w}×${selBox.h} cells. Set a name + footprint, then save.`)
  }

  async function onSave() {
    if (!atlas || !selBox) {
      setStatus('Select a region on the atlas first.')
      return
    }
    if (!name.trim()) {
      setStatus('Give the object a name.')
      return
    }
    // Crop the selection to a standalone PNG at native pixel size.
    const off = document.createElement('canvas')
    off.width = selBox.w * cell
    off.height = selBox.h * cell
    const ctx = off.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      atlas.img,
      selBox.c * cell, selBox.r * cell, off.width, off.height,
      0, 0, off.width, off.height,
    )
    const image = off.toDataURL('image/png')

    setStatus('Saving…')
    try {
      const saved = await saveTileObject({
        name: name.trim(),
        kind,
        image,
        footprint_w: Number(fpW) || selBox.w,
        footprint_h: Number(fpH) || selBox.h,
      })
      setStatus(`Saved "${saved.name}" as the active ${saved.kind}. It'll show on the map on reload.`)
    } catch (err) {
      setStatus(`Save failed: ${err.message}`)
    }
  }

  return (
    <div className="tilemapper">
      <header className="bar">
        <h1>Tile-Object Mapper</h1>
        <label className="upload">
          Atlas PNG
          <input type="file" accept="image/png" onChange={onUpload} />
        </label>
        <label>
          Cell
          <input
            type="number"
            min={1}
            value={cell}
            onChange={(e) => { setCell(Math.max(1, Number(e.target.value) || 1)); setSel(null) }}
            style={{ width: 52 }}
          />
        </label>
        <span className="zoom-ctl">
          Zoom
          <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 1))}>−</button>
          <span className="zoom-val">{zoom}×</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(8, z + 1))}>+</button>
        </span>
      </header>

      {status && <div className="status">{status}</div>}

      <div className="cols">
        <div className="left">
          <div className="canvas-wrap">
            {atlas ? (
              <canvas
                ref={canvasRef}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
              />
            ) : (
              <div className="empty">No atlas loaded.</div>
            )}
          </div>
        </div>

        <div className="right">
          <h3>Object</h3>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="tree">tree</option>
              <option value="prop">prop</option>
            </select>
          </label>
          <div className="fp">
            <label>
              Width (tiles)
              <input type="number" min={0.25} step={0.1} value={fpW}
                onChange={(e) => setFpW(Number(e.target.value) || 1)} style={{ width: 64 }} />
            </label>
            <label>
              Height (tiles)
              <input type="number" min={0.25} step={0.1} value={fpH}
                onChange={(e) => setFpH(Number(e.target.value) || 1)} style={{ width: 64 }} />
            </label>
          </div>

          <h3>Preview (map scale)</h3>
          <div className="preview-box">
            {selBox ? <canvas ref={previewRef} /> : <p className="hint">Drag a rectangle on the atlas.</p>}
          </div>

          <button type="button" className="save" onClick={onSave} disabled={!selBox}>
            Save to server
          </button>
        </div>
      </div>
    </div>
  )
}
