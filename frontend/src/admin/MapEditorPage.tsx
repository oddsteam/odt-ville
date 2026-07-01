import { useEffect, useMemo, useRef, useState } from 'react'
import { MapsService, mapCreateBody } from '../maps/service.ts'
import { bakeSourceMap } from '../maps/baker.ts'
import type { SourceMap } from '../maps/baker.ts'
import type { BakedMap } from '../maps/schema.ts'
import type { TileCatalog } from '../game/phaser/tileCatalog.ts'
import { GroundTilesService } from '../groundTiles/service.ts'
import type { GroundTile } from '../groundTiles/schema.ts'
import { TerrainsService } from '../terrains/service.ts'
import { priorityOrder } from '../terrains/schema.ts'
import { catalogFromGroundTiles, colsForGroundTiles } from './mapCatalog.ts'
import { makeTerrain, paintCell, paintRect, resizeTerrain, type Terrain } from './mapPaint.ts'
import MapPreview from './MapPreview.tsx'
import { runEdge } from '../lib/runEdge.ts'
import './admin.css'

// Map editor S3 (#107): paint terrain regions and see the real autotiled bake.
// The author picks a terrain from the palette (the catalog's priority stack)
// and paints the grid (brush or rectangle); the preview re-bakes through
// baker.ts + the shared draw path (MapPreview), so seams autotile exactly as
// /maps/<slug> will render them (ADR-0003). Save persists the painted source +
// baked via POST /api/v1/maps (#105).
//
// ADR-0004 import boundary: only the shared kernel (baker/catalog) + data
// service + the shared render path — never the Game Runtime (MapScene).

// Semantic swatch colour for the paint grid (the WYSIWYG preview shows the real
// tiles); unknown terrains fall back to grey, null cells are transparent.
const TERRAIN_COLOR: Record<string, string> = {
  grass: '#5fc24a',
  dirt: '#b98a4e',
  road: '#7d7d7d',
  water: '#3b7dd8',
  sand: '#e3d18a',
}
const swatch = (t: string | null) => (t ? TERRAIN_COLOR[t] ?? '#cccccc' : 'transparent')

const clampDim = (n: number) => Math.max(1, Math.min(Number.isFinite(n) ? n : 1, 40))

export default function MapEditorPage() {
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [cols, setCols] = useState(8)
  const [rows, setRows] = useState(6)
  const [terrain, setTerrain] = useState<Terrain>(() => makeTerrain(8, 6, null))
  const [selected, setSelected] = useState('')
  const [tool, setTool] = useState<'brush' | 'rect'>('brush')

  // The real Tile Catalog is derived from the ground tiles mapped in the Ground
  // Tiles tool + the persisted terrain priority (#120). Baking against it makes
  // the preview blit the actual tagged cells, and the priority *data* — not a
  // hardcoded stack — decides palette order + seam ownership, so reordering
  // flips ownership live. Null until the ground tiles have loaded.
  const [tiles, setTiles] = useState<readonly GroundTile[] | null>(null)
  const [colsByTileset, setColsByTileset] = useState<Record<string, number>>({})
  const [priority, setPriority] = useState<string[]>([])
  const catalog = useMemo<TileCatalog | null>(
    () => (tiles ? catalogFromGroundTiles(tiles, colsByTileset, priority) : null),
    [tiles, colsByTileset, priority],
  )
  const palette = catalog?.stack ?? []
  const defaultTerrain = palette[palette.length - 1] ?? null

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)

  const painting = useRef(false)
  const rectStart = useRef<{ x: number; y: number } | null>(null)

  // Load once: the mapped ground tiles + each sheet's column count, and the
  // persisted terrain priority (#120). The catalog is derived from all three, so
  // a later reorder just updates `priority` and the preview re-bakes.
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [loadedTiles, terrains] = await Promise.all([
          runEdge(GroundTilesService.list()),
          runEdge(TerrainsService.list()),
        ])
        const cols = await colsForGroundTiles(loadedTiles)
        if (!live) return
        setColsByTileset(cols)
        setPriority(priorityOrder(terrains))
        setTiles(loadedTiles)
      } catch (e) {
        if (live) setError((e as Error).message)
      }
    })()
    return () => {
      live = false
    }
  }, [])

  // Seed the grid + palette selection with the top-priority terrain once the
  // catalog is available, so there's something paintable immediately.
  useEffect(() => {
    if (!catalog || selected) return
    const top = catalog.stack[catalog.stack.length - 1] ?? null
    setSelected(top ?? '')
    setTerrain((t) => t.map((row) => row.map((c) => c ?? top)))
  }, [catalog, selected])

  // Reorder terrain priority through the tool: swap a terrain with its neighbour
  // in the persisted stack and save it. `dir` +1 raises priority (owns more
  // seams), -1 lowers it. Optimistic — the preview re-bakes at once — reverting
  // if the write fails.
  const movePriority = async (name: string, dir: 1 | -1) => {
    const i = priority.indexOf(name)
    const j = i + dir
    if (i < 0 || j < 0 || j >= priority.length) return
    const next = [...priority]
    ;[next[i], next[j]] = [next[j], next[i]]
    setPriority(next)
    try {
      await runEdge(TerrainsService.setOrder(next))
    } catch (e) {
      setPriority(priority)
      setError((e as Error).message)
    }
  }

  // Release the drag / cancel a rectangle if the mouse comes up off the grid.
  useEffect(() => {
    const end = () => {
      painting.current = false
      rectStart.current = null
    }
    window.addEventListener('mouseup', end)
    return () => window.removeEventListener('mouseup', end)
  }, [])

  const resize = (c: number, r: number) => {
    setCols(c)
    setRows(r)
    setTerrain((t) => resizeTerrain(t, c, r, defaultTerrain))
  }

  const down = (x: number, y: number) => {
    if (tool === 'brush') {
      painting.current = true
      setTerrain((t) => paintCell(t, x, y, selected))
    } else {
      rectStart.current = { x, y }
    }
  }
  const enter = (x: number, y: number) => {
    if (tool === 'brush' && painting.current) setTerrain((t) => paintCell(t, x, y, selected))
  }
  const up = (x: number, y: number) => {
    if (tool === 'rect' && rectStart.current) {
      const s = rectStart.current
      setTerrain((t) => paintRect(t, s.x, s.y, x, y, selected))
      rectStart.current = null
    }
  }

  // The WYSIWYG preview map: bake the painted source, then present it in the
  // runtime BakedMap shape (ground carries the autotiled stacks) — the same
  // document POST /maps returns, so preview and play render identically.
  // Only the painted terrain + dimensions affect what renders, so slug/title
  // keystrokes don't rebuild the preview.
  const previewMap = useMemo<BakedMap>(() => {
    const empty = { slug: 'preview', title: '', cols, rows, tilesets: [], tiles: [], entities: [] }
    if (!catalog) return empty
    const { baked } = bakeSourceMap({ slug: 'preview', title: '', cols, rows, terrain }, catalog)
    return { ...empty, tilesets: baked.ground.tilesets, ground: baked.ground }
  }, [cols, rows, terrain, catalog])

  const save = async () => {
    if (!catalog) return
    setBusy(true)
    setError(null)
    setSavedSlug(null)
    const source: SourceMap = { slug, title, cols, rows, terrain }
    try {
      const map = await runEdge(MapsService.create(mapCreateBody(source, catalog)))
      setSavedSlug(map.slug)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">New Map</h1>

      <div className="admin-field-inline">
        <label className="admin-field">
          Slug
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="the-meadow" />
        </label>
        <label className="admin-field">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Meadow" />
        </label>
        <label className="admin-field">
          Cols
          <input type="number" min={1} max={40} value={cols}
            onChange={(e) => resize(clampDim(e.target.valueAsNumber), rows)} />
        </label>
        <label className="admin-field">
          Rows
          <input type="number" min={1} max={40} value={rows}
            onChange={(e) => resize(cols, clampDim(e.target.valueAsNumber))} />
        </label>
      </div>

      {!catalog && <p className="admin-hint">Loading terrain catalog…</p>}
      {catalog && palette.length === 0 && (
        <p className="admin-msg admin-msg-error">No ground tiles mapped yet — tag some in the Ground Tiles tool first.</p>
      )}

      <div className="admin-field-inline">
        {/* Palette in stack order (low→high priority). The ▲/▼ reorder priority —
            the higher terrain owns the seam — persisting it so the preview and
            /maps/<slug> flip ownership together. */}
        {palette.map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button onClick={() => setSelected(t)}
              style={{ outline: selected === t ? '2px solid #fff' : 'none', background: swatch(t), color: '#000' }}>
              {t}
            </button>
            <button aria-label={`raise ${t} priority`} title="raise priority" onClick={() => movePriority(t, 1)}>▲</button>
            <button aria-label={`lower ${t} priority`} title="lower priority" onClick={() => movePriority(t, -1)}>▼</button>
          </span>
        ))}
        <span> · </span>
        <button onClick={() => setTool('brush')} disabled={tool === 'brush'}>Brush</button>
        <button onClick={() => setTool('rect')} disabled={tool === 'rect'}>Rectangle</button>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p className="admin-hint">Paint</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 22px)` }}
            onMouseLeave={() => (painting.current = false)}>
            {terrain.map((row, y) =>
              row.map((cell, x) => (
                <div
                  key={`${x},${y}`}
                  role="button"
                  aria-label={`cell ${x},${y}`}
                  onMouseDown={() => down(x, y)}
                  onMouseEnter={() => enter(x, y)}
                  onMouseUp={() => up(x, y)}
                  style={{ width: 22, height: 22, background: swatch(cell), border: '1px solid #0004', boxSizing: 'border-box' }}
                />
              )),
            )}
          </div>
        </div>
        <div>
          <p className="admin-hint">Preview (baked)</p>
          <MapPreview baked={previewMap} />
        </div>
      </div>

      <button onClick={save} disabled={busy || !slug || !title || !catalog}>
        {busy ? 'Saving…' : 'Save'}
      </button>

      {error && <p className="admin-msg admin-msg-error">{error}</p>}
      {savedSlug && (
        <p className="admin-msg">
          Saved. <a href={`/maps/${savedSlug}`}>Open /maps/{savedSlug}</a>
        </p>
      )}
    </div>
  )
}
