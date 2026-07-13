import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapsService } from '../maps/service.ts'
import type { BakedMap } from '../kernel/schema.ts'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import type { TileObject } from '../catalog/tileObjects/schema.ts'
import { makeMask, setMaskCell, resizeMask, isMaskEmpty, type Mask } from './maskPaint.ts'
import { groupPalette } from './paletteGroups.ts'
import { placeProp, erasePropAt, propEntities, propsFromBaked, propGhost, type PlacedProp, type SizeOf } from '../maps/props.ts'
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
  // Search box over the palette — filters objects by name/kind (#165).
  const [query, setQuery] = useState('')
  // The tile the cursor is over, driving the footprint ghost (#144); null off-map.
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [maskTool, setMaskTool] = useState<'paint' | 'erase'>('paint')
  const [showMask, setShowMask] = useState(true)
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

  // The palette, filtered by the search box and grouped under `kind` headers
  // (#165). Free-form kinds → sections appear/disappear with the data.
  const groups = useMemo(() => groupPalette(palette, query), [palette, query])

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

  // A press on the preview: paint the collision cell, or place/erase a prop.
  const down = (x: number, y: number) => {
    if (mode === 'collision') {
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
  // Only collision paints on drag (the preview reports one tile per crossing);
  // props stay click-only (one prop per cell).
  const paint = (x: number, y: number) => {
    if (mode === 'collision') setCollision((m) => setMaskCell(m, x, y, maskTool === 'paint'))
  }

  // The footprint ghost under the cursor (#144): only in props mode with a tool
  // picked. In place mode it's the selected object's art (red when off-edge, so
  // clicking would be refused); in erase mode a highlight box round the prop a
  // click removes. Pure presentation — never enters `props` or the save output.
  const ghost = useMemo(() => {
    if (mode !== 'props' || propTool == null || !hover || !baked) return null
    const g = propGhost(hover, propTool, props, sizeOf, { cols: baked.cols, rows: baked.rows })
    if (!g) return null
    const image = propTool === 'erase' ? undefined : byId.get(propTool)?.image
    return { x: g.x, y: g.y, w: g.w, h: g.h, image, refused: !g.valid }
    // sizeOf is derived from byId; listing byId keeps the footprint lookup fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, propTool, hover, baked, props, byId])

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

      <div className="decorate-layout">
        {/* Prop palette (#165) — a fixed, scrollable side panel: a search box
            over the saved objects (ADR-0008), grouped under collapsible `kind`
            headers as a thumbnail grid. Pick one then click the preview to stamp
            its reference; Erase clears a cell. */}
        {mode === 'props' && (
          <div className="decorate-palette">
            <input type="search" placeholder="Search objects…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="admin-field-inline">
              <button onClick={() => setPropTool('erase')}
                style={{ outline: propTool === 'erase' ? '2px solid #fff' : 'none' }}>Erase prop</button>
              {props.length > 0 && <span className="admin-hint">{props.length} placed</span>}
            </div>
            {palette.length === 0 && (
              <p className="admin-msg admin-msg-error">No saved objects yet — add some in the Objects tool first.</p>
            )}
            {palette.length > 0 && groups.length === 0 && <p className="admin-hint">No objects match “{query}”.</p>}
            {groups.map((g) => (
              <details key={g.kind} className="decorate-group" open>
                <summary>{g.kind} ({g.objects.length})</summary>
                <div className="decorate-grid">
                  {g.objects.map((o) => (
                    <button key={o.id} onClick={() => setPropTool(o.id)}
                      className={`decorate-thumb${propTool === o.id ? ' on' : ''}`}
                      title={`${o.name} (${o.footprint_w}×${o.footprint_h})`}>
                      <img src={o.image} alt={o.name} />
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}

        {/* One direct surface for both modes (#143/#145): the WYSIWYG preview
            *is* the editor. Props mode stamps/erases at the clicked tile;
            collision mode paints blocked cells (drawn back as the red overlay)
            and drag-paints across tiles. The abstract grid is gone. It grows to
            fill the width the fixed palette leaves (#165). */}
        <div className="decorate-preview">
          <p className="admin-hint">
            {mode === 'props' ? 'Preview — click to place' : 'Preview — drag to paint collision'}
          </p>
          <div style={{ flex: 1, minHeight: 0 }}>
            <MapPreview
              baked={previewMap}
              objects={palette}
              onTileDown={down}
              onTileDrag={paint}
              onTileHover={(x, y) => setHover({ x, y })}
              onTileHoverEnd={() => setHover(null)}
              overlay={mode === 'collision' && showMask ? collision : null}
              ghost={ghost}
              fill
            />
          </div>
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
