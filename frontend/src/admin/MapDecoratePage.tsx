import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapsService } from '../maps/service.ts'
import type { BakedMap } from '../maps/schema.ts'
import { TileObjectsService } from '../tileObjects/service.ts'
import type { TileObject } from '../tileObjects/schema.ts'
import { makeMask, setMaskCell, resizeMask, isMaskEmpty, type Mask } from './maskPaint.ts'
import { placeProp, erasePropAt, coveredCells, propEntities, propsFromBaked, type PlacedProp, type SizeOf } from '../maps/props.ts'
import MapPreview from './MapPreview.tsx'
import { runEdge } from '../lib/runEdge.ts'
import './admin.css'

// Standalone decorate editor (#139, extends the #131 collision editor): edit a
// *saved* map's authored layers — placed props and the collision mask —
// decoupled from create/import. Props are references to the saved tile objects
// (ADR-0008): the palette lists /admin/objects, a grid click stores
// `{kind:"prop", object_id, x, y}`, and the shared loader renders each at its
// authored footprint in the WYSIWYG preview. Save PATCHes props + mask in one
// write (MapsService.saveDecorations). Terrain is fixed at create; this page
// never re-bakes it. ADR-0004 boundary: data services + shared preview only.
export default function MapDecoratePage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [baked, setBaked] = useState<BakedMap | null>(null)
  const [collision, setCollision] = useState<Mask>(() => makeMask(0, 0))
  const [props, setProps] = useState<PlacedProp[]>([])
  // The prop palette: the full saved objects (images ride along for thumbnails
  // and the preview textures). Buildings are a later slice (#90) — not offered.
  const [palette, setPalette] = useState<readonly TileObject[]>([])
  // What a grid click does: place/erase a prop, or paint/erase the collision mask.
  const [mode, setMode] = useState<'props' | 'collision'>('props')
  const [propTool, setPropTool] = useState<number | 'erase' | null>(null)
  const [maskTool, setMaskTool] = useState<'paint' | 'erase'>('paint')
  const [showMask, setShowMask] = useState(true)
  const painting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Footprints off the fetched objects drive grid occupancy — a 2×2 object
  // claims 4 cells (markers, erase, overlap replacement, edge refusal). An
  // unknown reference falls back to 1×1 (#140 refines the dangling case).
  const byId = useMemo(() => new Map(palette.map((o) => [o.id, o])), [palette])
  const sizeOf: SizeOf = (id) => {
    const o = byId.get(id)
    return { w: o?.footprint_w ?? 1, h: o?.footprint_h ?? 1 }
  }
  const propAt = useMemo(() => coveredCells(props, sizeOf), [props, byId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Entities this editor doesn't manage (legacy tileset/frame props, later
  // kinds) — kept on the preview and on save so decorating never wipes them.
  const otherEntities = useMemo(
    () => (baked?.entities ?? []).filter((e) => !(e.kind === 'prop' && e.object_id != null)),
    [baked],
  )

  // The WYSIWYG preview: the loaded map with the current edits applied — the
  // unmanaged entities plus the placed props, rendered through the shared
  // loader with the palette objects' images. Null until the map loads.
  const previewMap = useMemo<BakedMap | null>(
    () => (baked ? { ...baked, entities: [...otherEntities, ...propEntities(props)] } : null),
    [baked, otherEntities, props],
  )

  // Load the map + the prop palette (roster → batched full objects, #138) and
  // seed both layers from the baked document (resizeMask fills missing cells
  // false; propsFromBaked reads back the placed object references).
  useEffect(() => {
    if (!slug) return
    let live = true
    Promise.all([
      runEdge(MapsService.get(slug)),
      runEdge(TileObjectsService.list()).then((roster) =>
        runEdge(TileObjectsService.getMany(roster.filter((o) => o.kind !== 'building').map((o) => o.id))),
      ),
    ])
      .then(([m, objects]) => {
        if (!live) return
        setBaked(m)
        setCollision(resizeMask(m.collision ?? [], m.cols, m.rows))
        setProps(propsFromBaked(m.entities))
        setPalette(objects)
        setPropTool((t) => t ?? objects[0]?.id ?? null)
      })
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [slug])

  // Release the drag if the mouse comes up off the grid.
  useEffect(() => {
    const end = () => (painting.current = false)
    window.addEventListener('mouseup', end)
    return () => window.removeEventListener('mouseup', end)
  }, [])

  const down = (x: number, y: number) => {
    if (mode === 'collision') {
      painting.current = true
      setCollision((m) => setMaskCell(m, x, y, maskTool === 'paint'))
      return
    }
    if (propTool == null || !baked) return
    setProps((ps) =>
      propTool === 'erase'
        ? erasePropAt(ps, x, y, sizeOf)
        : placeProp(ps, { object_id: propTool, x, y }, sizeOf, { cols: baked.cols, rows: baked.rows }),
    )
  }
  // Only collision paints on drag; props are click-only (one prop per cell).
  const enter = (x: number, y: number) => {
    if (mode === 'collision' && painting.current) setCollision((m) => setMaskCell(m, x, y, maskTool === 'paint'))
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await runEdge(MapsService.saveDecorations(slug, isMaskEmpty(collision) ? null : collision, props, otherEntities))
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !baked) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!baked || !previewMap) return <p className="admin-msg">Loading map…</p>

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Decorate — {baked.title}</h1>
      <p>
        <Link to="/admin/maps">← Back to maps</Link>
      </p>

      <div className="admin-field-inline" style={{ marginBottom: 4 }}>
        <button onClick={() => setMode('props')} disabled={mode === 'props'}>Props</button>
        <button onClick={() => setMode('collision')} disabled={mode === 'collision'}>Collision</button>
        {mode === 'collision' && (
          <>
            <button onClick={() => setMaskTool('paint')} disabled={maskTool === 'paint'}>Paint</button>
            <button onClick={() => setMaskTool('erase')} disabled={maskTool === 'erase'}>Erase</button>
            <button onClick={() => setShowMask((s) => !s)}>{showMask ? 'Hide overlay' : 'Show overlay'}</button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Prop palette — the saved objects (ADR-0008). Pick one then click the
            grid to stamp its reference; Erase clears a cell. */}
        {mode === 'props' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p className="admin-hint">Props (saved objects)</p>
            {palette.length === 0 && (
              <p className="admin-msg admin-msg-error">No saved objects yet — add some in the Objects tool first.</p>
            )}
            {palette.map((o) => (
              <button key={o.id} onClick={() => setPropTool(o.id)} title={`${o.name} (${o.footprint_w}×${o.footprint_h})`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 4, outline: propTool === o.id ? '2px solid #fff' : 'none' }}>
                <img src={o.image} alt="" style={{ width: 32, height: 32, objectFit: 'contain', imageRendering: 'pixelated' }} />
                {o.name}
              </button>
            ))}
            <button onClick={() => setPropTool('erase')}
              style={{ outline: propTool === 'erase' ? '2px solid #fff' : 'none' }}>Erase prop</button>
            {props.length > 0 && <span className="admin-hint">{props.length} prop{props.length > 1 ? 's' : ''} placed</span>}
          </div>
        )}

        <div>
          <p className="admin-hint">{mode === 'props' ? 'Place props' : 'Collision mask'}</p>
          <div
            style={{ display: 'grid', gridTemplateColumns: `repeat(${baked.cols}, 22px)` }}
            onMouseLeave={() => (painting.current = false)}
          >
            {Array.from({ length: baked.rows }, (_, y) =>
              Array.from({ length: baked.cols }, (_, x) => {
                const blocked = !!collision[y]?.[x]
                return (
                  <div
                    key={`d${x},${y}`}
                    role="button"
                    aria-label={`cell ${x},${y}`}
                    aria-pressed={mode === 'collision' ? blocked : propAt.has(`${x},${y}`)}
                    onMouseDown={() => down(x, y)}
                    onMouseEnter={() => enter(x, y)}
                    onMouseUp={() => (painting.current = false)}
                    style={{
                      width: 22,
                      height: 22,
                      background: showMask && blocked ? '#dd3333' : '#3a3a3a',
                      border: '1px solid #0004',
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* A dot marks a cell carrying a prop; the preview shows the art. */}
                    {propAt.has(`${x},${y}`) && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 1px #0008', pointerEvents: 'none' }} />
                    )}
                  </div>
                )
              }),
            )}
          </div>
        </div>
        <div>
          <p className="admin-hint">Preview (baked)</p>
          <MapPreview baked={previewMap} objects={palette} />
        </div>
      </div>

      <button onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {error && <p className="admin-msg admin-msg-error">{error}</p>}
      {saved && <p className="admin-msg">Saved.</p>}
    </div>
  )
}
