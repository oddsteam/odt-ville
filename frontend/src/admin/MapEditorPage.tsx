import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapsService, mapCreateBody, tiledMapCreateBody } from '../maps/service.ts'
import { bakeSourceMap } from '../kernel/baker.ts'
import type { SourceMap } from '../kernel/baker.ts'
import { importTiledMap, TiledImportError } from '../maps/service.ts'
import type { BakedGround, BakedMap } from '../kernel/schema.ts'
import type { TileCatalog } from '../kernel/tileCatalog.ts'
import { GroundTilesService } from '../catalog/groundTiles/service.ts'
import type { GroundTile } from '../catalog/groundTiles/schema.ts'
import { TerrainsService } from '../catalog/terrains/service.ts'
import { priorityOrder } from '../catalog/terrains/schema.ts'
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

  // Collision and props are not placed here — they're a separate step on a saved
  // map (/admin/maps/:slug/decorate), so create/import stays focused on terrain.

  // The real Tile Catalog is derived from the ground tiles mapped in the Ground
  // Tiles tool + the persisted terrain priority (#120). Baking against it makes
  // the preview blit the actual tagged cells, and the priority *data* — not a
  // hardcoded stack — decides palette order + seam ownership. Priority is
  // authored in the Ground Mapper (#198); a reorder shows here on next load.
  // Null until the ground tiles have loaded.
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

  // A Tiled import (ADR-0007). When set, the terrain producer is `tiled`: the
  // paint tools lock and the preview/save use this baked ground instead of the
  // painted source. Null = the normal painted producer.
  const [imported, setImported] = useState<{ source: unknown; ground: BakedGround } | null>(null)

  const painting = useRef(false)
  const rectStart = useRef<{ x: number; y: number } | null>(null)

  // Load once: the mapped ground tiles + each sheet's column count, and the
  // persisted terrain priority (#120). The catalog is derived from all three.
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

  // Import a Tiled JSON export (ADR-0007): parse, convert to the baked ground, and
  // check every referenced PNG resolves under the repo convention. A bad export
  // fails loudly here with every reason listed; on success the map switches to the
  // `tiled` producer (paint tools lock). `pngExists` is a real HEAD probe.
  const onImport = async (file: File) => {
    setBusy(true)
    setError(null)
    setSavedSlug(null)
    try {
      const json = JSON.parse(await file.text())
      const pngExists = async (name: string) =>
        (await fetch(`/maps/tilesets/${name}.png`, { method: 'HEAD' })).ok
      const ground = await importTiledMap(json, pngExists)
      setImported({ source: json, ground })
      setCols(ground.cols)
      setRows(ground.rows)
    } catch (e) {
      setImported(null)
      setError(e instanceof TiledImportError ? e.reasons.join('\n') : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // The WYSIWYG preview map: a Tiled import previews its imported ground directly;
  // otherwise bake the painted source. Both present the runtime BakedMap shape —
  // the same document POST /maps returns, so preview and play render identically.
  // Only the terrain + dimensions affect what renders, so slug/title keystrokes
  // don't rebuild the preview.
  const previewMap = useMemo<BakedMap>(() => {
    if (imported) {
      const g = imported.ground
      return { slug: 'preview', title: '', cols: g.cols, rows: g.rows, tilesets: g.tilesets, tiles: [], entities: [], ground: g, producer: 'tiled' }
    }
    const empty = { slug: 'preview', title: '', cols, rows, tilesets: [], tiles: [], entities: [] }
    if (!catalog) return empty
    const { baked } = bakeSourceMap({ slug: 'preview', title: '', cols, rows, terrain }, catalog)
    return { ...empty, tilesets: baked.ground.tilesets, ground: baked.ground }
  }, [cols, rows, terrain, catalog, imported])

  const save = async () => {
    setBusy(true)
    setError(null)
    setSavedSlug(null)
    try {
      // Collision is painted after saving, on the map picker → collision editor
      // (#131 follow-up); create/import persists terrain only.
      const body = imported
        ? tiledMapCreateBody({ slug, title }, imported.source, imported.ground)
        : mapCreateBody({ slug, title, cols, rows, terrain } as SourceMap, catalog!)
      const map = await runEdge(MapsService.create(body))
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
          <input type="number" min={1} max={40} value={cols} disabled={!!imported}
            onChange={(e) => resize(clampDim(e.target.valueAsNumber), rows)} />
        </label>
        <label className="admin-field">
          Rows
          <input type="number" min={1} max={40} value={rows} disabled={!!imported}
            onChange={(e) => resize(cols, clampDim(e.target.valueAsNumber))} />
        </label>
      </div>

      {/* Tiled import (ADR-0007). Picking an export converts it to the baked ground
          and switches the map to the `tiled` producer, locking the paint tools below.
          Clearing it returns to painting. */}
      <div className="admin-field-inline">
        <label className="admin-field">
          Import Tiled JSON
          {/* .tmj is Tiled's own JSON map extension (same content as .json). */}
          <input type="file" accept=".json,.tmj,application/json"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
        </label>
        {imported && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="admin-hint">Terrain imported from Tiled — paint tools locked.</span>
            <button onClick={() => setImported(null)}>Clear import</button>
          </span>
        )}
      </div>

      {!imported && !catalog && <p className="admin-hint">Loading terrain catalog…</p>}
      {!imported && catalog && palette.length === 0 && (
        <p className="admin-msg admin-msg-error">No ground tiles mapped yet — tag some in the Ground Tiles tool first.</p>
      )}

      {!imported && (
        <div className="admin-field-inline">
          <button onClick={() => setTool('brush')} disabled={tool === 'brush'}>Brush</button>
          <button onClick={() => setTool('rect')} disabled={tool === 'rect'}>Rectangle</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Terrain palette + paint grid — the `painted` producer's tools. A Tiled
            import (ADR-0007) resolves terrain in Tiled, so these lock; only the
            preview stays. */}
        {!imported && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p className="admin-hint">Terrain</p>
          {[...palette].reverse().map((t) => (
            <button key={t} onClick={() => setSelected(t)}
              style={{ minWidth: 72, textAlign: 'left', outline: selected === t ? '2px solid #fff' : 'none', background: swatch(t), color: '#000' }}>
              {t}
            </button>
          ))}
        </div>
        )}
        {!imported && (
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
        )}
        <div>
          <p className="admin-hint">Preview (baked)</p>
          <MapPreview baked={previewMap} />
        </div>
      </div>

      <button onClick={save} disabled={busy || !slug || !title || (!imported && !catalog)}>
        {busy ? 'Saving…' : 'Save'}
      </button>

      {error && <p className="admin-msg admin-msg-error">{error}</p>}
      {savedSlug && (
        <p className="admin-msg">
          Saved. <Link to={`/admin/maps/${savedSlug}/decorate`}>Decorate</Link>
          {' · '}
          <a href={`/maps/${savedSlug}`}>Open /maps/{savedSlug}</a>
        </p>
      )}
    </div>
  )
}
