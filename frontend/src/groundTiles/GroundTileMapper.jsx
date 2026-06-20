import { useCallback, useEffect, useRef, useState } from 'react'
import { TILESETS, tilesetUrl } from './tilesets.js'
import { listGroundTiles, saveGroundTile, deleteGroundTile } from './client.js'
import '../tileMapper/styles.css'
import './styles.css'

// Ground-Tile Mapper — admins pick a bundled tileset, click a single cell, and
// tag it with a surface type (grass, road, …). We store the *coordinate*
// (tileset, col, row) rather than a cropped PNG, so the game draws ground via
// its tilemap renderer (one texture, few draw calls) and the atlas/neighbour
// relationship survives for the edge/corner autotiling that comes later.
//
// No laying logic here: this only builds the catalog you see on the right.

const PRESETS = ['grass', 'road', 'dirt', 'water', 'sand']

// Module-level cache of loaded tileset images. The roster can span several
// tilesets, so thumbnails load each on demand without re-fetching.
const imgCache = new Map()
function loadTileset(name) {
  if (imgCache.has(name)) return imgCache.get(name)
  const p = new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load tileset ${name}.png`))
    img.src = tilesetUrl(name)
  })
  imgCache.set(name, p)
  return p
}

// A tiny canvas that crops one cell out of its tileset for the roster.
function Thumb({ tile, size = 32 }) {
  const ref = useRef(null)
  useEffect(() => {
    let alive = true
    loadTileset(tile.tileset)
      .then((img) => {
        if (!alive || !ref.current) return
        const ctx = ref.current.getContext('2d')
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, size, size)
        ctx.drawImage(
          img,
          tile.col * tile.cell, tile.row * tile.cell, tile.cell, tile.cell,
          0, 0, size, size,
        )
      })
      .catch(() => {})
    return () => { alive = false }
  }, [tile.tileset, tile.col, tile.row, tile.cell, size])
  return <canvas ref={ref} width={size} height={size} className="thumb" />
}

export default function GroundTileMapper() {
  const [tileset, setTileset] = useState(TILESETS[0].name)
  const [atlas, setAtlas] = useState(null) // { img, width, height }
  const [zoom, setZoom] = useState(2)
  const [sel, setSel] = useState(null) // { c, r } single cell
  const [type, setType] = useState('grass')
  const [label, setLabel] = useState('')
  const [catalog, setCatalog] = useState([])
  const [status, setStatus] = useState('Pick a tileset, click a cell, set its type, then save.')

  const canvasRef = useRef(null)
  const meta = TILESETS.find((t) => t.name === tileset) || TILESETS[0]
  const cell = meta.cell
  const cols = atlas ? Math.floor(atlas.width / cell) : 0
  const rows = atlas ? Math.floor(atlas.height / cell) : 0

  // Tagged cells in the *current* tileset, keyed "c,r" -> tile (for grid marks).
  const taggedHere = new Map()
  for (const t of catalog) {
    if (t.tileset === tileset) taggedHere.set(`${t.col},${t.row}`, t)
  }

  const refreshCatalog = useCallback(() => {
    listGroundTiles()
      .then((rows) => setCatalog(rows || []))
      .catch((e) => setStatus(`Load failed: ${e.message}`))
  }, [])

  useEffect(() => { refreshCatalog() }, [refreshCatalog])

  // Load the selected tileset image.
  useEffect(() => {
    let alive = true
    setAtlas(null)
    setSel(null)
    loadTileset(tileset)
      .then((img) => {
        if (!alive) return
        setAtlas({ img, width: img.naturalWidth, height: img.naturalHeight })
        setStatus(`Loaded ${tileset} (${img.naturalWidth}×${img.naturalHeight}). Click a cell.`)
      })
      .catch((e) => { if (alive) setStatus(e.message) })
    return () => { alive = false }
  }, [tileset])

  // Draw atlas + grid + tagged marks + selection.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !atlas) return
    const step = cell * zoom
    canvas.width = cols * step
    canvas.height = rows * step
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(atlas.img, 0, 0, canvas.width, canvas.height)

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath(); ctx.moveTo(x * step + 0.5, 0); ctx.lineTo(x * step + 0.5, rows * step); ctx.stroke()
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * step + 0.5); ctx.lineTo(cols * step, y * step + 0.5); ctx.stroke()
    }

    // Already-tagged cells: a tinted overlay + the type's first letter.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.max(8, Math.min(step - 4, 13))}px system-ui, sans-serif`
    for (const [key, t] of taggedHere) {
      const [c, r] = key.split(',').map(Number)
      ctx.fillStyle = 'rgba(46,125,255,0.4)'
      ctx.fillRect(c * step, r * step, step, step)
      ctx.fillStyle = '#fff'
      ctx.fillText((t.tile_type[0] || '?').toUpperCase(), c * step + step / 2, r * step + step / 2)
    }

    // Current selection
    if (sel) {
      ctx.strokeStyle = '#ffd23e'
      ctx.lineWidth = 2
      ctx.strokeRect(sel.c * step + 1, sel.r * step + 1, step - 2, step - 2)
    }
  }, [atlas, cell, zoom, cols, rows, sel, catalog, tileset])

  function cellAt(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const step = cell * zoom
    return {
      c: Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - rect.left) / step))),
      r: Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - rect.top) / step))),
    }
  }

  function onCanvasClick(e) {
    if (!atlas) return
    const { c, r } = cellAt(e)
    setSel({ c, r })
    const existing = taggedHere.get(`${c},${r}`)
    if (existing) {
      setType(existing.tile_type)
      setLabel(existing.label || '')
      setStatus(`Cell ${c},${r} is "${existing.tile_type}". Change its type and save, or delete it.`)
    } else {
      setStatus(`Cell ${c},${r} selected. Set a type and save.`)
    }
  }

  async function onSave() {
    if (!sel) { setStatus('Click a cell on the tileset first.'); return }
    if (!type.trim()) { setStatus('Set a tile type.'); return }
    setStatus('Saving…')
    try {
      const saved = await saveGroundTile({
        tile_type: type.trim(), tileset, col: sel.c, row: sel.r, cell, label: label.trim(),
      })
      setStatus(`Saved cell ${saved.col},${saved.row} as "${saved.tile_type}".`)
      refreshCatalog()
    } catch (e) {
      setStatus(`Save failed: ${e.message}`)
    }
  }

  async function onDelete(id) {
    try {
      await deleteGroundTile(id)
      refreshCatalog()
      setStatus('Removed tile from the catalog.')
    } catch (e) {
      setStatus(`Delete failed: ${e.message}`)
    }
  }

  // Group the catalog by surface type for the roster.
  const byType = {}
  for (const t of catalog) (byType[t.tile_type] ||= []).push(t)
  const types = Object.keys(byType).sort()

  return (
    <div className="tilemapper">
      <header className="bar">
        <h1>Ground-Tile Mapper</h1>
        <label>
          Tileset
          <select value={tileset} onChange={(e) => setTileset(e.target.value)}>
            {TILESETS.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </label>
        <span className="zoom-ctl">
          Zoom
          <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 1))}>−</button>
          <span className="zoom-val">{zoom}×</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(6, z + 1))}>+</button>
        </span>
      </header>

      {status && <div className="status">{status}</div>}

      <div className="cols">
        <div className="left">
          <div className="canvas-wrap">
            {atlas ? (
              <canvas ref={canvasRef} onClick={onCanvasClick} />
            ) : (
              <div className="empty">Loading tileset…</div>
            )}
          </div>
        </div>

        <div className="right">
          <h3>Tag cell</h3>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`preset${type === p ? ' on' : ''}`}
                onClick={() => setType(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <label>
            Type
            <input value={type} onChange={(e) => setType(e.target.value)} placeholder="grass" />
          </label>
          <label>
            Label (optional)
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="plain grass" />
          </label>
          <button type="button" className="save" onClick={onSave} disabled={!sel}>
            {sel ? `Save cell ${sel.c},${sel.r}` : 'Click a cell first'}
          </button>

          <h3>Catalog ({catalog.length})</h3>
          <div className="catalog">
            {types.length === 0 && <p className="hint">No tiles tagged yet.</p>}
            {types.map((ty) => (
              <div key={ty} className="cat-group">
                <div className="cat-head">{ty} ({byType[ty].length})</div>
                {byType[ty].map((t) => (
                  <div key={t.id} className="cat-row">
                    <Thumb tile={t} />
                    <span className="cat-meta">
                      {t.tileset.replace(/_32x32$/, '')} · r{t.row} c{t.col}
                      {t.label ? <em> — {t.label}</em> : null}
                    </span>
                    <button type="button" className="del" onClick={() => onDelete(t.id)} title="Remove">×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
