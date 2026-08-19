import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapsService } from '../maps/service.ts'
import type { MapSummary } from '../maps/service.ts'
import type { BakedMap, Zone, ZoneFacing, ZoneTrigger } from '../kernel/schema.ts'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import type { TileObject } from '../catalog/tileObjects/schema.ts'
import { NpcsService } from '../catalog/npcs/service.ts'
import { loadNpcRigs } from '../character/service.ts'
import type { Npc } from '../catalog/npcs/schema.ts'
import { makeMask, setMaskCell, resizeMask, isMaskEmpty, type Mask } from './maskPaint.ts'
import { groupPalette } from './paletteGroups.ts'
import { frameArtStyle } from './frameArt.ts'
import { zoneRects as buildZoneRects, ZONE_COLORS } from './zoneRects.ts'
import { placeProp, erasePropAt, propEntities, propsFromBaked, propGhost, propIndexAt, nudgeProp, newZone, retrigger, triggersFor, zoneIndexAt, eraseZoneAt, replaceZone, previewMapOf, placeNpc, eraseNpcAt, npcIndexAt, npcEntities, npcsFromBaked, NPC_FACING_DEFAULT, isDuellist, markDuellist, unmarkDuellist, syncDuellistZones, type PlacedProp, type PlacedNpc, type SizeOf, type MaskOf, type DoorOf, type NudgeDir, type ZoneKind } from '../maps/service.ts'
import type { MapAccessPolicy } from '../kernel/schema.ts'
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
  // paint/erase the collision mask. `settings` (#91) only shows the panel —
  // clicks on the map do nothing.
  const [mode, setMode] = useState<'props' | 'npcs' | 'zones' | 'collision' | 'settings'>('props')
  const [propTool, setPropTool] = useState<number | 'erase' | null>(null)
  // The placed prop armed for arrow-key nudging (#341) — its index in `props`.
  // Set on placing one or clicking one; cleared on Escape, an empty click, or
  // leaving props mode. Nudging re-places through the pure grid ops, so it can
  // walk art off any edge into a negative anchor as long as a cell stays on-map.
  const [selectedProp, setSelectedProp] = useState<number | null>(null)
  // The authored zones (#90, ADR-0005) — trigger + payload regions, edited as
  // full desired state like props. A click places the picked kind (or selects
  // the zone already there); the inspector edits the selected one.
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneTool, setZoneTool] = useState<ZoneKind | 'erase'>('portal')
  const [selectedZone, setSelectedZone] = useState<number | null>(null)
  // Saved maps, for a portal payload's target picker (plus the reserved town hub).
  const [mapList, setMapList] = useState<readonly MapSummary[]>([])
  // The NPC catalog (#259), for a trainer payload's NPC picker and the NPC
  // palette (#294).
  const [npcs, setNpcs] = useState<readonly Npc[]>([])
  // The NPCs placed on the map (#294) — catalog references posed at a facing,
  // edited as full desired state like props, and the one under the inspector.
  // `npcRigs` are their character manifests, fetched so the preview draws each
  // NPC's own sprite rather than a placeholder.
  const [placedNpcs, setPlacedNpcs] = useState<PlacedNpc[]>([])
  const [npcTool, setNpcTool] = useState<number | 'erase' | null>(null)
  const [selectedNpc, setSelectedNpc] = useState<number | null>(null)
  const [npcRigs, setNpcRigs] = useState<readonly { id: number; manifest: unknown }[]>([])
  // Search box over the palette — filters objects by name/kind (#165).
  const [query, setQuery] = useState('')
  // The tile the cursor is over, driving the footprint ghost (#144); null off-map.
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [maskTool, setMaskTool] = useState<'paint' | 'erase'>('paint')
  // The map settings (#91, ADR-0005 Node properties), seeded from the loaded
  // document and PATCHed back with the decoration save.
  const [multiplayer, setMultiplayer] = useState(false)
  const [policy, setPolicy] = useState<MapAccessPolicy>({ kind: 'public' })
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
  // Every entity the prop baker doesn't produce: the ones this editor doesn't
  // manage (legacy tileset/frame props, later kinds) — kept on the preview and
  // on save so decorating never wipes them — plus the placed NPCs (#294), which
  // bake from their own list and so are dropped from the loaded document first
  // rather than riding through as unmanaged.
  const otherEntities = useMemo(
    () => [
      ...(baked?.entities ?? []).filter(
        (e) => e.kind !== 'npc' && !(e.kind === 'prop' && e.object_id != null),
      ),
      ...npcEntities(placedNpcs),
    ],
    [baked, placedNpcs],
  )

  // The WYSIWYG preview: the loaded map with the current edits applied — the
  // unmanaged entities plus the placed props, rendered through the shared
  // loader with the palette objects' images. Null until the map loads.
  // Fold the *live* zones in too (#493): the Phaser preview's blink glow reads
  // map.zones, so without this a deleted link zone keeps pulsing until reload.
  const previewMap = useMemo<BakedMap | null>(
    () => (baked ? previewMapOf(baked, zones, [...otherEntities, ...propEntities(props)]) : null),
    [baked, zones, otherEntities, props],
  )

  // The palette, filtered by the search box and grouped under `kind` headers
  // (#165). Free-form kinds → sections appear/disappear with the data.
  const groups = useMemo(() => groupPalette(palette, query), [palette, query])

  // The interactive gutter round the preview (#347): sized to the largest
  // palette footprint, so the mouse can name any off-map anchor that still
  // keeps a cell on-map. Props mode only — collision/zones/NPCs stay in-bounds.
  const gutter = useMemo(
    () => palette.reduce((g, o) => Math.max(g, Math.ceil(o.footprint_w), Math.ceil(o.footprint_h)), 1),
    [palette],
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
        setPlacedNpcs(npcsFromBaked(m.entities))
        setZones([...(m.zones ?? [])])
        setMultiplayer(m.multiplayer ?? false)
        setPolicy(m.access_policy ?? { kind: 'public' })
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

  // The rig behind each catalogued NPC (#294): one manifest fetch per NPC that
  // has one, so the preview stamps the real sprite. Best-effort per NPC
  // (loadManifestById resolves null on any failure) — a rig-less NPC can still
  // be placed, it just draws nothing.
  useEffect(() => {
    let live = true
    loadNpcRigs(npcs).then((rigs) => live && setNpcRigs(rigs))
    return () => {
      live = false
    }
  }, [npcs])

  // The derived-facing contract (#296): a duellist NPC's sight cone is seeded
  // from its pose, so whenever the NPCs change — turned, erased, or a cell
  // re-stamped — reconcile every seeded cone to match. `syncDuellistZones`
  // returns the same array when nothing moved, so React bails and there's no
  // loop; hand-authored trainer Zones are left alone.
  useEffect(() => {
    setZones((zs) => syncDuellistZones(zs, placedNpcs))
  }, [placedNpcs])

  // Arrow keys nudge the selected placed prop one cell per press (#341),
  // through the same pure grid ops as placement so overlap and save behaviour
  // stay uniform — and the only way to reach a negative anchor (top/left
  // overhang), which no grid click can name. A move that would push the last
  // footprint cell off the map is refused (nudgeProp returns the prop put).
  // Escape disarms. Active only in props mode with a prop selected, and ignored
  // while a form control has focus so the palette search keeps its arrow keys.
  // `props` is a dep so each press nudges from the current list, not a stale one.
  useEffect(() => {
    if (mode !== 'props' || selectedProp == null || !baked) return undefined
    const bounds = { cols: baked.cols, rows: baked.rows }
    const dirs: Record<string, NudgeDir> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    }
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        setSelectedProp(null)
        return
      }
      const dir = dirs[e.key]
      if (!dir) return
      e.preventDefault()
      const { props: next, index } = nudgeProp(props, selectedProp, dir, sizeOf, bounds)
      setProps(next)
      setSelectedProp(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // sizeOf is derived from byId; listing byId keeps the footprint lookup fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedProp, baked, props, byId])

  // A press on the preview: paint the collision cell, place/select/erase a
  // zone or an NPC, or place/erase a prop.
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
    if (mode === 'npcs') {
      if (npcTool === 'erase') {
        setPlacedNpcs((ns) => eraseNpcAt(ns, x, y))
        setSelectedNpc(null)
        return
      }
      // Like zones: a click on a placed NPC selects it for the inspector, an
      // empty cell stamps the picked one facing the default and selects that.
      const hit = npcIndexAt(placedNpcs, x, y)
      if (hit >= 0) {
        setSelectedNpc(hit)
        return
      }
      if (npcTool == null) return
      setPlacedNpcs((ns) => placeNpc(ns, { npc_id: npcTool, x, y, facing: NPC_FACING_DEFAULT }))
      setSelectedNpc(placedNpcs.length)
      return
    }
    if (mode !== 'props' || propTool == null || !baked) return
    if (propTool === 'erase') {
      setProps((ps) => erasePropAt(ps, x, y, sizeOf))
      setSelectedProp(null)
      return
    }
    // Like NPCs/zones: a click on a placed prop selects it for arrow-key
    // nudging (#341); an empty cell stamps the picked object and selects that.
    // placeProp appends the new prop last, so its index is the fresh length−1
    // (any overlapped props it replaced are already dropped).
    const hit = propIndexAt(props, x, y, sizeOf)
    if (hit >= 0) {
      setSelectedProp(hit)
      return
    }
    const next = placeProp(props, { object_id: propTool, x, y }, sizeOf, { cols: baked.cols, rows: baked.rows })
    setProps(next)
    setSelectedProp(next.length - 1)
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
    // The art rides along whole (#437): an animated object's `image` is a frame
    // strip the preview must show one frame of, which needs its frame count/fps.
    const art = propTool === 'erase' ? undefined : byId.get(propTool)
    return { x: g.x, y: g.y, w: g.w, h: g.h, art, refused: !g.valid }
    // sizeOf is derived from byId; listing byId keeps the footprint lookup fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, propTool, hover, baked, props, byId])

  // The selected placed prop's footprint, drawn as a persistent highlight so
  // the author sees what arrow keys nudge (#341) — including a negative anchor,
  // whose off-map cells fall outside the frame and just clip. Props mode only.
  const selection = useMemo(() => {
    if (mode !== 'props' || selectedProp == null) return null
    const p = props[selectedProp]
    if (!p) return null
    const { w, h } = sizeOf(p.object_id)
    return { x: p.x, y: p.y, w: Math.max(1, Math.ceil(w)), h: Math.max(1, Math.ceil(h)) }
    // sizeOf is derived from byId; listing byId keeps the footprint lookup fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedProp, props, byId])

  // The zones overlay (#90): every authored zone as a tinted, labeled rect —
  // shown only in zones mode, with the selected one highlighted for editing.
  const zoneRects = useMemo(
    () => (mode === 'zones' ? buildZoneRects(zones, selectedZone) : undefined),
    [mode, zones, selectedZone],
  )

  // The placed NPC under edit and its inspector write-back (#294) — the facing
  // dropdown re-poses the sprite in the preview on the next render.
  const placedNpc = selectedNpc != null ? placedNpcs[selectedNpc] : null
  const editNpc = (next: PlacedNpc) =>
    setPlacedNpcs((ns) => ns.map((n, i) => (i === selectedNpc ? next : n)))
  const npcName = (id: number) => npcs.find((n) => n.id === id)?.name ?? `#${id} (deleted)`

  // The collision view with the placed NPCs folded in (#294): an NPC blocks its
  // cell through the walk_mask baked onto its entity, not through the painted
  // mask, so the overlay shows it blocked while the eraser leaves it alone —
  // you clear an NPC's cell by deleting the NPC.
  const blockedOverlay = useMemo(
    () => placedNpcs.reduce((m, n) => setMaskCell(m, n.x, n.y, true), collision),
    [collision, placedNpcs],
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

  // A non-claim policy drops any leftover role/group so the stored jsonb stays
  // clean; opt() already drops cleared inputs from a claim policy.
  const settings = () => ({
    multiplayer,
    access_policy: policy.kind === 'claim' ? policy : { kind: policy.kind },
  })

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await runEdge(MapsService.saveDecorations(slug, isMaskEmpty(collision) ? null : collision, props, otherEntities, zones, maskOf, edgeMaskOf, doorOf, settings()))
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Preview in game (#91): open the real play shell on the map's own route, so
  // the preview is the same URL the published map serves. Saved decorations
  // only — the draft route never survived the hop to a fresh tab.
  const previewInGame = () => {
    if (!baked) return
    window.open(`/maps/${slug}`, '_blank', 'noopener')
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
        <button onClick={() => setMode('npcs')} disabled={mode === 'npcs'}>NPCs</button>
        <button onClick={() => setMode('zones')} disabled={mode === 'zones'}>Zones</button>
        <button onClick={() => setMode('collision')} disabled={mode === 'collision'}>Collision</button>
        <button onClick={() => setMode('settings')} disabled={mode === 'settings'}>Settings</button>
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
            <p className="admin-hint">
              {selection
                ? `Selected at (${selection.x}, ${selection.y}) — arrow keys nudge (off any edge), Escape to deselect.`
                : 'Click a placed object to select it, then arrow keys nudge — including off an edge.'}
            </p>
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
                      aria-label={o.name}
                      title={`${o.name} (${o.footprint_w}×${o.footprint_h})`}>
                      {/* Painted as a background, not an <img> (#437): an
                          animated object's `image` is a frame strip, which an
                          <img> would smear across the slot. */}
                      <span className="decorate-thumb-art" style={frameArtStyle(o, 'contain')} />
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}

        {/* NPC palette + inspector (#294): pick an enabled NPC from the catalog
            and click the preview to stamp it (or click a placed one to edit);
            the inspector turns which way it looks and the preview re-poses its
            own sprite. A placed NPC blocks its cell. */}
        {mode === 'npcs' && (
          <div className="decorate-palette">
            <div className="admin-field-inline">
              <button onClick={() => setNpcTool('erase')}
                style={{ outline: npcTool === 'erase' ? '2px solid #fff' : 'none' }}>Erase NPC</button>
              {placedNpcs.length > 0 && <span className="admin-hint">{placedNpcs.length} placed</span>}
            </div>
            {npcs.filter((n) => n.enabled).length === 0 && (
              <p className="admin-msg admin-msg-error">No enabled NPCs — add some in the <Link to="/admin/npcs">NPCs</Link> tool first.</p>
            )}
            <div className="admin-field-inline" style={{ flexWrap: 'wrap' }}>
              {npcs.filter((n) => n.enabled).map((n) => (
                <button key={n.id} onClick={() => setNpcTool(n.id)}
                  style={{ outline: npcTool === n.id ? '2px solid #fff' : 'none' }}>
                  {n.name}
                </button>
              ))}
            </div>
            {!placedNpc && <p className="admin-hint">Click the map to place an NPC, or click a placed one to turn it.</p>}
            {placedNpc && (
              <div className="admin-field" style={{ display: 'grid', gap: 6 }}>
                <strong>{npcName(placedNpc.npc_id)} at ({placedNpc.x}, {placedNpc.y})</strong>
                <label>Faces{' '}
                  {/* The pose it starts in — the runtime owns it once the NPC
                      walks, and a trainer's sight cone is the Zone's own
                      `facing`, not this one (#294). */}
                  <select value={placedNpc.facing}
                    onChange={(e) => editNpc({ ...placedNpc, facing: e.target.value as ZoneFacing })}>
                    {FACINGS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                {/* Marking a duellist (#296) emits a trainer on_sight Zone at
                    this cell, its cone seeded from — and kept in sync with — the
                    facing above. Un-marking deletes that cone; range/footprint
                    are edited on it in the Zones tool. */}
                <label>
                  <input type="checkbox" checked={isDuellist(zones, placedNpc)}
                    onChange={(e) =>
                      setZones((zs) => (e.target.checked ? markDuellist(zs, placedNpc) : unmarkDuellist(zs, placedNpc)))
                    } />
                  {' '}Duellist — sees you in a cone
                </label>
              </div>
            )}
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
              // A cone seeded by marking an NPC a duellist (#296): its trigger,
              // facing and NPC are owned by that NPC, so they're shown read-only
              // here — only range/footprint stay authorable on the Zone.
              const fromNpc = p.kind === 'trainer' && p.fromNpc === true
              return (
              <div className="admin-field" style={{ display: 'grid', gap: 6 }}>
                <strong>{p.kind} at ({zone.x}, {zone.y})</strong>
                {fromNpc && <p className="admin-hint">Seeded from the NPC at this cell — facing follows its pose (#296). Turn it in the NPCs tool.</p>}
                {!fromNpc && (
                  <label>Trigger{' '}
                    {/* retrigger carries the aim across the switch, because the
                        schema ties `facing` to on_sight (#86) — picking it here
                        seeds a facing rather than producing an illegal zone. */}
                    <select value={zone.trigger}
                      onChange={(e) => editZone(retrigger(zone, e.target.value as ZoneTrigger))}>
                      {[...new Set([...triggersFor(p.kind), zone.trigger])].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                )}
                {zone.trigger === 'on_sight' && (
                  <>
                    {!fromNpc && (
                      <label>Faces{' '}
                        <select value={zone.facing}
                          onChange={(e) => editZone({ ...zone, facing: e.target.value as ZoneFacing })}>
                          {FACINGS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </label>
                    )}
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
                    {/* Entry spawn (#84) names a spawn point on the *target*
                        map — and nothing in this editor can place one, so as a
                        free-text box this only ever produced ids that missed.
                        A miss was silent: the arrival fell back to the target's
                        centre, which is how the library→downtown centre-spawn
                        shipped (#453). Disabled rather than deleted, because
                        hand-baked ids (seeds, the API) are real and an author
                        editing this zone must still see and be able to drop one.
                        Unset is now the good default, not a fallback: #453 lands
                        arrivals on the target's door back to this map. */}
                    <label>Entry spawn{' '}
                      <input type="text" disabled placeholder="(the door back to this map)"
                        value={p.entrySpawnId ?? ''} />
                    </label>
                    {p.entrySpawnId ? (
                      <p className="admin-hint">
                        Hand-baked spawn — not editable here. Clearing it lands arrivals on
                        this map&rsquo;s door instead.{' '}
                        <button type="button"
                          onClick={() => editZone({ ...zone, payload: { ...p, entrySpawnId: undefined } })}>
                          Clear
                        </button>
                      </p>
                    ) : (
                      <p className="admin-hint">
                        Arrivals land on {p.targetNode || 'the target'}&rsquo;s door back to this map,
                        or its centre if it has none.
                      </p>
                    )}
                  </>
                )}
                {p.kind === 'trainer' && (
                  fromNpc ? (
                    // Seeded cone: the NPC is the placed one this cone belongs to
                    // (#296), not a free choice — shown, not picked.
                    <p className="admin-hint">NPC: {npcName(p.npcId)}</p>
                  ) : (
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
                  )
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
                {p.kind === 'meeting' && (
                  <>
                    {/* The room this rect drops you into (#485): standing inside
                        it joins that room's call (#486). Author-assigned, seeded
                        with a slug on placement so moving the rect never strands
                        people in a different room. */}
                    <label>Room{' '}
                      <input type="text" placeholder="room-id" value={p.roomId}
                        onChange={(e) => editZone({ ...zone, payload: { ...p, roomId: e.target.value } })} />
                    </label>
                    <label>Label{' '}
                      <input type="text" value={p.label ?? ''}
                        onChange={(e) => editZone({ ...zone, payload: { ...p, label: opt(e.target.value) } })} />
                    </label>
                  </>
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
                    {/* Presentation only: the runtime rings the zone with a
                        pulsing glow just outside its border, under the object
                        art, so a player can see there is something to press. */}
                    <label className="admin-field-inline">
                      <input type="checkbox" checked={!!p.blink}
                        onChange={(e) => editZone({ ...zone, payload: { ...p, blink: e.target.checked || undefined } })} />
                      Blinking — glow the zone&rsquo;s border in game
                    </label>
                  </>
                )}
              </div>
              )
            })()}
          </div>
        )}

        {/* Map settings (#91): the two Node properties (ADR-0005) — who may
            list/load the map (the server-side #83 gate) and whether players
            see each other (#88). Saved with the decorations in one PATCH. */}
        {mode === 'settings' && (
          <div className="decorate-palette">
            <label className="admin-field">
              Access
              <select value={policy.kind}
                onChange={(e) => setPolicy({ ...policy, kind: e.target.value as MapAccessPolicy['kind'] })}>
                <option value="public">public — any signed-in user</option>
                <option value="claim">claim — needs a role or group</option>
                <option value="members">members — invited users only</option>
              </select>
            </label>
            {policy.kind === 'claim' && (
              <>
                <label className="admin-field">
                  Role
                  <input type="text" placeholder="staff" value={policy.role ?? ''}
                    onChange={(e) => setPolicy({ ...policy, role: opt(e.target.value) })} />
                </label>
                <label className="admin-field">
                  Group
                  <input type="text" placeholder="/odds" value={policy.group ?? ''}
                    onChange={(e) => setPolicy({ ...policy, group: opt(e.target.value) })} />
                </label>
                <p className="admin-hint">A visitor needs the role or the group. Leaving both blank won't save.</p>
              </>
            )}
            <label className="admin-field-inline">
              <input type="checkbox" checked={multiplayer}
                onChange={(e) => setMultiplayer(e.target.checked)} />
              Multiplayer — players on this map see each other
            </label>
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
              npcRigs={npcRigs}
              onTileDown={down}
              onTileDrag={paint}
              onTileHover={(x, y) => setHover({ x, y })}
              onTileHoverEnd={() => setHover(null)}
              overlay={mode === 'collision' && showMask ? blockedOverlay : null}
              zoneRects={zoneRects}
              ghost={ghost}
              selection={selection}
              fill
              gutter={mode === 'props' ? gutter : 0}
            />
          </div>
        </div>
      </div>

      <div className="admin-field-inline">
        <button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={previewInGame} disabled={busy}>Preview in game</button>
        <span className="admin-hint">Preview opens the draft — unsaved edits included — in the real runtime, in a new tab.</span>
      </div>
      {error && <p className="admin-msg admin-msg-error">{error}</p>}
      {saved && <p className="admin-msg">Saved.</p>}
    </div>
  )
}
