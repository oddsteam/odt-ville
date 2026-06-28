import { useCallback, useEffect, useRef, useState } from 'react'
import { activateTileObject, deactivateTileObject, deleteTileObject, getTileObject, listTileObjects, saveTileObject } from '../tileObjects/client.js'
import type { TileObject, TileObjectSummary } from '../tileObjects/schema.ts'
import { validateWalkMask } from '../game/town.ts'
import './styles.css'

type Atlas = { img: HTMLImageElement; src: string; width: number; height: number }
type Sel = { c0: number; r0: number; c1: number; r1: number }
type DragAnchor = { c: number; r: number }

// Tile-Object Mapper — admins upload an atlas PNG, drag a rectangle over the
// cell grid to select a whole object (a tree, a prop), then save it. The
// browser crops that region to a standalone PNG (data URL) so the game just
// draws one image; the atlas never has to ship to the game. See the Rails
// tile_objects API + TownScene's tall-prop overlay.

const MAP_TILE = 48 // px per tile in the game — used to preview real map size.

// Map a click on the footprint preview (rectW×rectH px showing cols×rows tiles)
// to a clamped door-cell offset. The town uses this single cell as the building
// entrance — what isWalkable / playerDepthAt / door-entry all read (issue #29).
export function doorCellFromClick(
  px: number, py: number, rectW: number, rectH: number, cols: number, rows: number,
): { dx: number; dy: number } {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, Math.floor(v)))
  return { dx: clamp((px / rectW) * cols, cols), dy: clamp((py / rectH) * rows, rows) }
}

// Turn the set of painted walkable cells ("dx,dy") into the row-major walk mask
// the town stamps (issue #32): '.' = walkable (porch/path), '#' = solid. Cells
// outside the cols×rows footprint are dropped.
export function buildWalkMask(walk: ReadonlySet<string>, cols: number, rows: number): string[] {
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    for (let c = 0; c < cols; c++) row += walk.has(`${c},${r}`) ? '.' : '#'
    out.push(row)
  }
  return out
}

// Inverse of buildWalkMask — turn a stored row-major walk mask back into the set
// of painted "dx,dy" walkable cells, so a saved building loads into the editor
// with its porch/path already painted (#32).
export function walkCellsFromMask(mask: readonly string[]): Set<string> {
  const out = new Set<string>()
  mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '.') out.add(`${c},${r}`)
  })
  return out
}

export default function TileMapper() {
  const [atlas, setAtlas] = useState<Atlas | null>(null) // { img, src, width, height }
  const [cell, setCell] = useState(16)
  const [zoom, setZoom] = useState(3)
  const [sel, setSel] = useState<Sel | null>(null) // { c0, r0, c1, r1 } inclusive cell range
  const [name, setName] = useState('tree')
  const [kind, setKind] = useState('tree')
  const [fpW, setFpW] = useState(1.4)
  const [fpH, setFpH] = useState(1.8)
  // Door cell for a 'building' (#29) — the admin clicks the entrance on the
  // footprint preview; offset from the footprint's top-left. Null until picked.
  const [door, setDoor] = useState<{ dx: number; dy: number } | null>(null)
  // Authored walk mask for a 'building' (#32) — the set of "dx,dy" cells the
  // admin painted walkable (porch/path). Plus which the preview click edits.
  const [walk, setWalk] = useState<ReadonlySet<string>>(new Set())
  const [paintMode, setPaintMode] = useState<'walk' | 'door'>('walk')
  const [status, setStatus] = useState('Upload an atlas PNG to begin.')
  const [saved, setSaved] = useState<readonly TileObjectSummary[]>([]) // roster for the saved-objects list
  // When editing a saved object (#29/#32), its cropped art loads here and drives
  // the preview instead of an atlas selection — so the admin can add/adjust the
  // door + walkable path without re-uploading and re-selecting the atlas.
  const [editImg, setEditImg] = useState<HTMLImageElement | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragAnchor | null>(null) // { c, r } drag anchor while the mouse is down

  // Saved-objects roster — which tile-objects exist and which is the active one
  // of each kind. Refreshed on mount and after every save/activate.
  const refreshSaved = useCallback(() => {
    listTileObjects().then(setSaved).catch(() => {})
  }, [])
  useEffect(() => refreshSaved(), [refreshSaved])

  const onActivate = useCallback(
    (id: number) => {
      activateTileObject(id)
        .then(() => refreshSaved())
        .catch((err: unknown) => setStatus(`Activate failed: ${err instanceof Error ? err.message : String(err)}`))
    },
    [refreshSaved],
  )

  const onDeactivate = useCallback(
    (id: number) => {
      deactivateTileObject(id)
        .then(() => refreshSaved())
        .catch((err: unknown) => setStatus(`Deactivate failed: ${err instanceof Error ? err.message : String(err)}`))
    },
    [refreshSaved],
  )

  // Delete a saved object for good (#35). Deletes are irreversible, so confirm
  // first; if it was the active one of its kind, the game falls back to default.
  const onDelete = useCallback(
    (o: TileObjectSummary) => {
      if (!window.confirm(`Delete "${o.name}"? This can't be undone.`)) return
      deleteTileObject(o.id)
        .then(() => refreshSaved())
        .catch((err: unknown) => setStatus(`Delete failed: ${err instanceof Error ? err.message : String(err)}`))
    },
    [refreshSaved],
  )

  // Load a saved object back into the editor: restore its fields + painted walk
  // mask, and draw its stored art in the preview so the door/path can be placed
  // against the real building (#29/#32). Re-saving upserts by name → same record.
  const onEdit = useCallback((id: number) => {
    setStatus('Loading…')
    getTileObject(id)
      .then((o: TileObject) => {
        setName(o.name)
        setKind(o.kind)
        setFpW(o.footprint_w)
        setFpH(o.footprint_h)
        setDoor(o.door_dx != null && o.door_dy != null ? { dx: o.door_dx, dy: o.door_dy } : null)
        setWalk(o.walk_mask ? walkCellsFromMask(o.walk_mask) : new Set())
        setPaintMode('walk')
        setSel(null) // leave atlas-selection mode; the loaded art drives the preview
        const img = new Image()
        img.onload = () => {
          setEditImg(img)
          setStatus(`Editing "${o.name}". Add/adjust the door + walkable path, then Save.`)
        }
        img.onerror = () => setStatus('Could not load the saved image.')
        img.src = o.image
      })
      .catch((err: unknown) => setStatus(`Load failed: ${err instanceof Error ? err.message : String(err)}`))
  }, [])

  const cols = atlas ? Math.floor(atlas.width / cell) : 0
  const rows = atlas ? Math.floor(atlas.height / cell) : 0

  // The building footprint as a whole-tile grid for the door picker.
  const isBuilding = kind === 'building'
  const doorCols = Math.max(1, Math.round(fpW))
  const doorRows = Math.max(1, Math.round(fpH))

  // Normalized selection in cells (inclusive), or null.
  const selBox = sel
    ? {
        c: Math.min(sel.c0, sel.c1),
        r: Math.min(sel.r0, sel.r1),
        w: Math.abs(sel.c1 - sel.c0) + 1,
        h: Math.abs(sel.r1 - sel.r0) + 1,
      }
    : null

  const onUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        setAtlas({ img, src: reader.result as string, width: img.naturalWidth, height: img.naturalHeight })
        setSel(null)
        setEditImg(null) // a fresh atlas leaves saved-object edit mode
        setStatus(`Loaded atlas (${img.naturalWidth}×${img.naturalHeight}). Drag to select an object.`)
      }
      img.onerror = () => setStatus('Could not read that image.')
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }, [])

  // ---- draw the atlas + grid + selection ----------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !atlas) return
    canvas.width = atlas.width * zoom
    canvas.height = atlas.height * zoom
    const ctx = canvas.getContext('2d')!
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
  const previewRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || (!editImg && !(atlas && selBox))) return
    const w = Math.max(1, Math.round(fpW * MAP_TILE))
    const h = Math.max(1, Math.round(fpH * MAP_TILE))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, w, h)
    if (editImg) {
      // Editing a saved object — its art is already cropped, draw it whole.
      ctx.drawImage(editImg, 0, 0, w, h)
    } else if (atlas && selBox) {
      ctx.drawImage(
        atlas.img,
        selBox.c * cell, selBox.r * cell, selBox.w * cell, selBox.h * cell,
        0, 0, w, h,
      )
    }

    // For a building, overlay the footprint grid, the painted walkable cells
    // (#32), and the picked door cell so the admin sees the authored entry path
    // and where the entrance lands (issue #29).
    if (!isBuilding) return
    const cw = w / doorCols
    const ch = h / doorRows
    ctx.fillStyle = 'rgba(46,125,255,0.35)' // painted walkable cells
    for (let r = 0; r < doorRows; r++)
      for (let c = 0; c < doorCols; c++)
        if (walk.has(`${c},${r}`)) ctx.fillRect(c * cw, r * ch, cw, ch)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    for (let c = 1; c < doorCols; c++) ctx.strokeRect(c * cw + 0.5, 0, 0, h)
    for (let r = 1; r < doorRows; r++) ctx.strokeRect(0, r * ch + 0.5, w, 0)
    if (door) {
      ctx.fillStyle = 'rgba(46,200,90,0.45)'
      ctx.fillRect(door.dx * cw, door.dy * ch, cw, ch)
    }
  }, [atlas, cell, selBox, editImg, fpW, fpH, isBuilding, doorCols, doorRows, door, walk])

  // Click the preview to either mark the entrance (door mode) or toggle a
  // walkable cell (walk mode) — issue #29/#32.
  function onPreviewClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isBuilding) return
    const rect = previewRef.current!.getBoundingClientRect()
    const cell = doorCellFromClick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, doorCols, doorRows)
    if (paintMode === 'door') {
      setDoor(cell)
      return
    }
    setWalk((prev) => {
      const next = new Set(prev)
      const key = `${cell.dx},${cell.dy}`
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ---- drag-select on the canvas ------------------------------------
  function cellAt(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const step = cell * zoom
    const c = Math.floor((e.clientX - rect.left) / step)
    const r = Math.floor((e.clientY - rect.top) / step)
    return {
      c: Math.max(0, Math.min(cols - 1, c)),
      r: Math.max(0, Math.min(rows - 1, r)),
    }
  }
  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!atlas) return
    const { c, r } = cellAt(e)
    dragRef.current = { c, r }
    setSel({ c0: c, r0: r, c1: c, r1: r })
  }
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
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
    setEditImg(null) // a new atlas selection leaves saved-object edit mode
    // Default the footprint to the selected cell span (1 cell ≈ 1 tile), which
    // the admin can then tune for how big it should read on the map.
    setFpW(selBox.w)
    setFpH(selBox.h)
    setStatus(`Selected ${selBox.w}×${selBox.h} cells. Set a name + footprint, then save.`)
  }

  async function onSave() {
    if (!editImg && (!atlas || !selBox)) {
      setStatus('Select a region on the atlas first.')
      return
    }
    if (!name.trim()) {
      setStatus('Give the object a name.')
      return
    }
    // A building must ship an authored, reachable interior walk mask (#32): a
    // door + at least one walkable tile + a path connecting them to a footprint
    // edge, so the avatar can actually enter. Block the save otherwise.
    const mask = isBuilding ? buildWalkMask(walk, doorCols, doorRows) : undefined
    if (isBuilding) {
      const v = validateWalkMask(mask, doorCols, doorRows, door)
      if (!v.ok) {
        setStatus(
          v.reason === 'no-door'
            ? 'Place the door before saving (Door mode, then click the entrance).'
            : v.reason === 'no-walkable'
              ? 'Paint at least one walkable tile (the porch/path to the door).'
              : 'The door is not reachable — paint a walkable path from the door to a footprint edge.',
        )
        return
      }
    }
    // In edit mode the art is already a standalone PNG; otherwise crop the atlas
    // selection to one at native pixel size.
    let image: string
    if (editImg) {
      image = editImg.src
    } else {
      const off = document.createElement('canvas')
      off.width = selBox!.w * cell
      off.height = selBox!.h * cell
      const ctx = off.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(
        atlas!.img,
        selBox!.c * cell, selBox!.r * cell, off.width, off.height,
        0, 0, off.width, off.height,
      )
      image = off.toDataURL('image/png')
    }

    setStatus('Saving…')
    try {
      const obj = await saveTileObject({
        name: name.trim(),
        kind,
        image,
        footprint_w: Number(fpW) || selBox?.w || 1,
        footprint_h: Number(fpH) || selBox?.h || 1,
        // Building entrance, when picked. Unsent → the town defaults to
        // bottom-centre (its existing hardcoded door).
        door_dx: isBuilding && door ? door.dx : undefined,
        door_dy: isBuilding && door ? door.dy : undefined,
        // Authored interior walk mask (#32) — only for buildings, validated above.
        walk_mask: mask,
      })
      setStatus(`Saved "${obj.name}" as the active ${obj.kind}. It'll show on the map on reload.`)
      refreshSaved()
    } catch (err: unknown) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
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
            <select value={kind} onChange={(e) => { setKind(e.target.value); setDoor(null); setWalk(new Set()) }}>
              <option value="tree">tree</option>
              <option value="prop">prop</option>
              <option value="flower-group">flower-group</option>
              <option value="flower-single">flower-single</option>
              <option value="building">building</option>
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
            {selBox || editImg ? <canvas ref={previewRef} onClick={onPreviewClick} /> : <p className="hint">Drag a rectangle on the atlas, or Edit a saved object.</p>}
          </div>
          {isBuilding && (selBox || editImg) && (
            <>
              <div className="paint-mode">
                <span>Paint:</span>
                <button
                  type="button"
                  className={paintMode === 'walk' ? 'is-on' : ''}
                  onClick={() => setPaintMode('walk')}
                >
                  Walkable
                </button>
                <button
                  type="button"
                  className={paintMode === 'door' ? 'is-on' : ''}
                  onClick={() => setPaintMode('door')}
                >
                  Door
                </button>
              </div>
              <p className="hint">
                {paintMode === 'walk'
                  ? 'Click cells to paint the walkable porch/path (toggle).'
                  : 'Click the entrance cell.'}{' '}
                {door ? `Door at ${door.dx},${door.dy}.` : 'No door yet.'} Save is blocked until the door
                is reachable from a footprint edge via walkable tiles.
              </p>
            </>
          )}

          <button type="button" className="save" onClick={onSave} disabled={!selBox && !editImg}>
            Save to server
          </button>

          <h3>Saved objects</h3>
          <ul className="saved-list">
            {saved.length === 0 && <li className="hint">No saved objects yet.</li>}
            {saved.map((o) => (
              <li key={o.id} className={o.active ? 'is-active' : ''}>
                <div className="saved-head">
                  <span className="saved-name">{o.name}</span>
                  {o.active && <span className="saved-badge">active</span>}
                </div>
                <div className="saved-meta">
                  <span className="saved-kind">{o.kind}</span>
                  <span className="saved-fp">{o.footprint_w}×{o.footprint_h}</span>
                </div>
                <div className="saved-actions">
                  <button type="button" onClick={() => onEdit(o.id)}>
                    Edit
                  </button>
                  {o.active ? (
                    <button type="button" onClick={() => onDeactivate(o.id)}>
                      Deactivate
                    </button>
                  ) : (
                    <button type="button" onClick={() => onActivate(o.id)}>
                      Activate
                    </button>
                  )}
                  <button type="button" className="danger" onClick={() => onDelete(o)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
