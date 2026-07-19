import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapsService } from '../maps/service.ts'
import type { MapSummary } from '../maps/service.ts'
import type { BakedMap, Zone, ZoneFacing, ZoneTrigger } from '../kernel/schema.ts'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import type { TileObject } from '../catalog/tileObjects/schema.ts'
import { NpcsService } from '../catalog/npcs/service.ts'
import type { Npc } from '../catalog/npcs/schema.ts'
import { makeMask, setMaskCell, resizeMask, isMaskEmpty, type Mask } from './maskPaint.ts'
import { groupPalette } from './paletteGroups.ts'
import { zoneRects as buildZoneRects, ZONE_COLORS } from './zoneRects.ts'
import { placeProp, erasePropAt, propEntities, propsFromBaked, propGhost, newZone, retrigger, triggersFor, zoneIndexAt, eraseZoneAt, replaceZone, type PlacedProp, type SizeOf, type MaskOf, type DoorOf, type ZoneKind } from '../maps/service.ts'
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
// The palette offers exactly what the runtime consumes — `trainer` (#259)
// joined with its duel; `encounter` (#87) lands next. Each kind arrives with
// its behaviour, so an author can never place a zone nothing fires. Its tints
// and the overlay's rects live in ./zoneRects.ts.
const FACINGS: readonly ZoneFacing[] = ['up', 'down', 'left', 'right']

export default function MapDecoratePage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [baked, setBaked] = useState<BakedMap | null>(null)
  const [collision, setCollision] = useState<Mask>(() => makeMask(0, 0))
  const [props, setProps] = useState<PlacedProp[]>([])
  // The prop palette: the full saved objects (images ride along for thumbnails
  // and the preview textures). Includes buildings (#166) — placing one bakes
  // its authoring walk_mask onto the entity so collision applies automatically.
  const [palette, setPalette] = useState<readonly TileObject[]>([])
  // What a grid click does: place/erase a prop, place/select/erase a zone, or
  // paint/erase the collision mask.
  const [mode, setMode] = useState<'props' | 'zones' | 'collision'>('props')
  const [propTool, setPropTool] = useState<number | 'erase' | null>(null)
  // The authored zones (#90, ADR-0005) — trigger + payload regions, edited as
  // full desired state like props. A click places the picked kind (or selects
  // the zone already there); the inspector edits the selected one.
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneTool, setZoneTool] = useState<ZoneKind | 'erase'>('portal')
  const [selectedZone, setSelectedZone] = useState<number | null>(null)
  // Saved maps, for a portal payload's target picker (plus the reserved town hub).
  const [mapList, setMapList] = useState<readonly MapSummary[]>([])
  // The NPC catalog (#259), for a trainer payload's NPC picker.
  const [npcs, setNpcs] = useState<readonly Npc[]>([])
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
  // The authoring walk_mask a placed object carries, resolved from the catalog
  // at save (#166): denormalized onto the baked entity so a placed building
  // blocks its solid cells at runtime with no hand-painting. Null/absent → no
  // mask emitted (plain prop or dangling reference).
  const maskOf: MaskOf = (id) => byId.get(id)?.walk_mask ?? undefined
  // The finer authoring edge_mask a placed object carries (#207): fence-style
  // border collision, denormalized onto the baked entity the same way so the
  // authored-map runtime blocks the marked cell borders. Independent of walk_mask.
  const edgeMaskOf: MaskOf = (id) => byId.get(id)?.edge_mask ?? undefined
  // The door anchor a placed building carries (#29, #212): denormalized onto the
  // baked entity as door_dx/door_dy so the authored-map runtime can identify the
  // building's walkable entrance cell. Non-building / no door → no fields emitted.
  const doorOf: DoorOf = (id) => {
    const o = byId.get(id)
    return o?.door_dx != null && o?.door_dy != null ? { dx: o.door_dx, dy: o.door_dy } : undefined
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
        runEdge(TileObjectsService.getMany(roster.map((o) => o.id))),
      ),
      runEdge(MapsService.list()),
      // Best-effort: the trainer picker is empty if the catalog is unreachable,
      // but props/collision/portal authoring still works.
      runEdge(NpcsService.list()).catch(() => [] as readonly Npc[]),
    ])
      .then(([m, objects, maps, npcList]) => {
        if (!live) return
        setBaked(m)
        setCollision(resizeMask(m.collision ?? [], m.cols, m.rows))
        setProps(propsFromBaked(m.entities))
        setZones([...(m.zones ?? [])])
        setPalette(objects)
        setMapList(maps)
        setNpcs(npcList)
        setPropTool((t) => t ?? objects[0]?.id ?? null)
      })
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [slug])

  // A press on the preview: paint the collision cell, place/select/erase a
  // zone, or place/erase a prop.
  const down = (x: number, y: number) => {
    if (mode === 'collision') {
      setCollision((m) => setMaskCell(m, x, y, maskTool === 'paint'))
      return
    }
    if (mode === 'zones') {
      if (zoneTool === 'erase') {
        setZones((zs) => eraseZoneAt(zs, x, y))
        setSelectedZone(null)
        return
      }
      // A click on an existing zone selects it for the inspector; an empty
      // cell stamps a fresh 1×1 zone of the picked kind and selects that.
      const hit = zoneIndexAt(zones, x, y)
      if (hit >= 0) {
        setSelectedZone(hit)
        return
      }
      setZones((zs) => [...zs, newZone(zoneTool, x, y)])
      setSelectedZone(zones.length)
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

  // The zones overlay (#90): every authored zone as a tinted, labeled rect —
  // shown only in zones mode, with the selected one highlighted for editing.
  const zoneRects = useMemo(
    () => (mode === 'zones' ? buildZoneRects(zones, selectedZone) : undefined),
    [mode, zones, selectedZone],
  )

  // The zone under edit and its inspector write-back.
  const zone = selectedZone != null ? zones[selectedZone] : null
  const editZone = (next: Zone) => {
    if (selectedZone != null) setZones((zs) => replaceZone(zs, selectedZone, next))
  }
  // Optional payload fields ('' from a cleared input) drop off the document.
  const opt = (v: string) => (v === '' ? undefined : v)
  // Portal targets: the reserved town hub plus every saved map — and the
  // current value even if it dangles, so the select never shows a lie.
  const portalTargets = useMemo(() => {
    const known = ['town', ...mapList.map((m) => m.slug)]
    const current = zone?.payload.kind === 'portal' ? [zone.payload.targetNode] : []
    return [...new Set([...known, ...current])]
  }, [mapList, zone])

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await runEdge(MapsService.saveDecorations(slug, isMaskEmpty(collision) ? null : collision, props, otherEntities, zones, maskOf, edgeMaskOf, doorOf))
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
        <button onClick={() => setMode('zones')} disabled={mode === 'zones'}>Zones</button>
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

        {/* Zone palette + inspector (#90, ADR-0005): pick a payload kind and
            click the preview to place a 1×1 zone (or select the one already
            there); the inspector edits the selected zone's trigger, footprint
            and payload. Erase removes the zone under a click. */}
        {mode === 'zones' && (
          <div className="decorate-palette">
            <div className="admin-field-inline">
              {(Object.keys(ZONE_COLORS) as ZoneKind[]).map((k) => (
                <button key={k} onClick={() => setZoneTool(k)}
                  style={{ outline: zoneTool === k ? '2px solid #fff' : 'none', borderLeft: `4px solid ${ZONE_COLORS[k]}` }}>
                  {k}
                </button>
              ))}
              <button onClick={() => setZoneTool('erase')}
                style={{ outline: zoneTool === 'erase' ? '2px solid #fff' : 'none' }}>Erase</button>
            </div>
            {zones.length > 0 && <span className="admin-hint">{zones.length} placed</span>}
            {!zone && <p className="admin-hint">Click the map to place a {zoneTool === 'erase' ? '…' : zoneTool} zone, or click a placed zone to edit it.</p>}
            {zone && (() => {
              // Const alias so the payload's kind-narrowing survives into the
              // onChange closures (property narrowing resets there).
              const p = zone.payload
              return (
              <div className="admin-field" style={{ display: 'grid', gap: 6 }}>
                <strong>{p.kind} at ({zone.x}, {zone.y})</strong>
                <label>Trigger{' '}
                  {/* retrigger carries the aim across the switch, because the
                      schema ties `facing` to on_sight (#86) — picking it here
                      seeds a facing rather than producing an illegal zone. */}
                  <select value={zone.trigger}
                    onChange={(e) => editZone(retrigger(zone, e.target.value as ZoneTrigger))}>
                    {[...new Set([...triggersFor(p.kind), zone.trigger])].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                {zone.trigger === 'on_sight' && (
                  <>
                    <label>Faces{' '}
                      <select value={zone.facing}
                        onChange={(e) => editZone({ ...zone, facing: e.target.value as ZoneFacing })}>
                        {FACINGS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </label>
                    <label>Sees (tiles){' '}
                      <input type="number" min={1} max={Math.max(baked.cols, baked.rows)} value={zone.range ?? 1}
                        onChange={(e) => editZone({ ...zone, range: Math.max(1, Number(e.target.value) || 1) })} />
                    </label>
                  </>
                )}
                <label>Width{' '}
                  <input type="number" min={1} max={baked.cols} value={zone.w ?? 1}
                    onChange={(e) => editZone({ ...zone, w: Math.max(1, Number(e.target.value) || 1) })} />
                </label>
                <label>Height{' '}
                  <input type="number" min={1} max={baked.rows} value={zone.h ?? 1}
                    onChange={(e) => editZone({ ...zone, h: Math.max(1, Number(e.target.value) || 1) })} />
                </label>
                {p.kind === 'portal' && (
                  <>
                    <label>Target map{' '}
                      <select value={p.targetNode}
                        onChange={(e) => editZone({ ...zone, payload: { ...p, targetNode: e.target.value } })}>
                        {portalTargets.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label>Entry spawn{' '}
                      <input type="text" placeholder="(map centre)" value={p.entrySpawnId ?? ''}
                        onChange={(e) => editZone({ ...zone, payload: { ...p, entrySpawnId: opt(e.target.value) } })} />
                    </label>
                  </>
                )}
                {p.kind === 'trainer' && (
                  <label>NPC{' '}
                    {/* Identity comes from the catalog row (#259); the payload
                        holds only which one duels you. facing/range are the
                        on_sight fields above, not duplicated here. */}
                    <select value={p.npcId}
                      onChange={(e) => editZone({ ...zone, payload: { ...p, npcId: Number(e.target.value) } })}>
                      <option value={0}>(pick an NPC)</option>
                      {npcs.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </label>
                )}
                {p.kind === 'encounter' && (
                  <label>Pool{' '}
                    {/* The named wild-encounter group this grass rolls (#87).
                        A slug (like portal's target), not a catalog id — it
                        names a group of monsters, resolved server-side at roll
                        time. Empty = the whole global pool (#69 fallback). */}
                    <input type="text" placeholder="(global pool)" value={p.pool}
                      onChange={(e) => editZone({ ...zone, payload: { ...p, pool: e.target.value } })} />
                  </label>
                )}
                {p.kind === 'link' && (
                  <>
                    <label>URL{' '}
                      <input type="url" placeholder="https://…" value={p.url}
                        onChange={(e) => editZone({ ...zone, payload: { ...p, url: e.target.value } })} />
                    </label>
                    <label>Label{' '}
                      <input type="text" value={p.label ?? ''}
                        onChange={(e) => editZone({ ...zone, payload: { ...p, label: opt(e.target.value) } })} />
                    </label>
                  </>
                )}
              </div>
              )
            })()}
          </div>
        )}

        {/* One direct surface for both modes (#143/#145): the WYSIWYG preview
            *is* the editor. Props mode stamps/erases at the clicked tile;
            collision mode paints blocked cells (drawn back as the red overlay)
            and drag-paints across tiles. The abstract grid is gone. It grows to
            fill the width the fixed palette leaves (#165). */}
        <div className="decorate-preview">
          <p className="admin-hint">
            {mode === 'collision' ? 'Preview — drag to paint collision' : 'Preview — click to place'}
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
              zoneRects={zoneRects}
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
