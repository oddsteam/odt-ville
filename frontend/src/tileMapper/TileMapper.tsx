import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import { TileObjectsWrite } from '../catalog/tileObjects/write.ts'
import type { TileObjectDetail } from '../catalog/tileObjects/schema.ts'
import { runEdge } from '../lib/runEdge.ts'
import { validateWalkMask } from '../kernel/walkMask.ts'
import { TILESETS, tilesetUrl } from '../catalog/groundTiles/service.ts'
import { cellAtPoint, useScrollView, visibleSlice } from '../lib/tilesetWindow.ts'
import {
  authorsWalkMask, buildEdgeMask, buildWalkMask, edgeSetFromMask,
  ladderCellsFromMask, overhangCellsFromMask, requiresDoorValidation, walkCellsFromMask,
} from './masks.ts'
import { maskHasInk } from './foreground.ts'
import { doorCellFromClick, edgeSideFromClick, effectiveCell, type Source } from './selection.ts'
import {
  bounds, compositionSheets, flatten, fromComposition, remember, sameBlock, toComposition,
  type Block, type Composition, type Placed,
} from './composition.ts'
import CompositionPane from './CompositionPane.tsx'
import ForegroundEditor from './ForegroundEditor.tsx'
import SavedObjects from './SavedObjects.tsx'
import '../lib/mapperChrome.css'

type Tileset = { img: HTMLImageElement; width: number; height: number }
type Sel = { c0: number; r0: number; c1: number; r1: number }
type DragAnchor = { c: number; r: number }

// Tile-Object Mapper — admins pick a source sheet (a repo-committed tileset from
// the shared registry, or a one-off uploaded PNG), then either drag a rectangle
// over the cell grid to lift a whole object out of it, or compose one from
// tileset parts on the composition canvas (#353). Either way the browser
// flattens the result to a standalone PNG (data URL) so the game just draws one
// image; the tileset never has to ship to the game. See the Rails tile_objects
// API + TownScene's tall-prop overlay.

const MAP_TILE = 48 // px per tile in the game — used to preview real map size.
const MAX_FP = 20 // largest building footprint, in tiles (20×20 cap; see town.ts MAX_W/MAX_H).
// The sheet key an uploaded PNG's cells carry. ponytail: one slot — uploading a
// second PNG re-points cells stamped from the first. Key by file name if that
// ever bites; registry tilesets (the normal path) key by their own name.
const UPLOAD_SHEET = 'upload'

// Load an image URL, resolving null if it 404s — so reopening a composition can
// tell a removed tileset (fall back to flat art) from a present one (#355).
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export default function TileMapper() {
  const [tileset, setTileset] = useState<Tileset | null>(null) // { img, width, height }
  // Every sheet loaded this session, by name — the composition's cells name the
  // sheet they came from, so switching the tileset adds a sheet to draw from
  // rather than replacing the one the art depends on (#354).
  const [sheets, setSheets] = useState<ReadonlyMap<string, HTMLImageElement>>(new Map())
  // Where the source sheet comes from (#351): a registry tileset fetched by URL
  // (the default — survives a reload, no file picker) or an uploaded one-off PNG.
  const [source, setSource] = useState<Source>('tileset')
  const [tilesetName, setTilesetName] = useState(TILESETS[0].name)
  const [manualCell, setManualCell] = useState(32) // upload mode only; see effectiveCell
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
  // Overhang cells for a 'building' (#44) — "dx,dy" footprint cells the admin
  // marked walk-under: walkable, but the avatar renders beneath the building art.
  const [overhangCells, setOverhangCells] = useState<ReadonlySet<string>>(new Set())
  // Ladder cells for a 'building' (#54) — "dx,dy" footprint cells the admin
  // marked as a ladder: walkable like a path, but the avatar climbs while on them.
  const [ladderCells, setLadderCells] = useState<ReadonlySet<string>>(new Set())
  // Impassable cell borders for a 'building' (#53) — "c,r,side" keys (side
  // N/E/S/W) the admin marked as a ledge the avatar can't step across.
  const [edgeCells, setEdgeCells] = useState<ReadonlySet<string>>(new Set())
  // Collides toggle for a 'prop' (#338) — off by default (walk-over). On makes
  // the footprint block the avatar like a building; the Walkable paint carves
  // the pass-through cells and the result saves to walk_mask (no door required).
  const [collides, setCollides] = useState(false)
  const [paintMode, setPaintMode] = useState<'walk' | 'door' | 'fg' | 'overhang' | 'ladder' | 'edge'>('walk')
  // The foreground mask (#36) the admin paints in ForegroundEditor — held here
  // because save is what reads it. `loadedFg` is a saved mask to restore into it.
  const [loadedFg, setLoadedFg] = useState<string | null>(null)
  const fgMaskRef = useRef<HTMLCanvasElement | null>(null)
  const [status, setStatus] = useState('Loading tileset…')
  // When editing a saved object (#29/#32), its cropped art loads here and drives
  // the preview instead of a tileset selection — so the admin can add/adjust the
  // door + walkable path without re-uploading and re-selecting the tileset.
  const [editImg, setEditImg] = useState<HTMLImageElement | null>(null)
  // The composition (#353/#354) — an ordered stack of layers, each mapping a
  // composition cell → the source tileset cell it draws. The picked tileset
  // rectangle is the block; stamping/repeat-dragging on the composition canvas
  // fills the active layer in. A second layer puts a sign over a wall. Non-empty
  // composition ⇒ it, not the raw selection, is the object's art.
  const [layers, setLayers] = useState<readonly Placed[]>([new Map()])
  const [active, setActive] = useState(0)
  // The composition flattened at native resolution — what the preview, the
  // foreground editor and the save all draw. Rebuilt whenever a layer changes.
  const [composed, setComposed] = useState<HTMLCanvasElement | null>(null)
  // The recent-blocks strip (#356) — the last dozen picks, pinned above the
  // board so building ten shops off one style block costs one hunt, not ten.
  // Session-only: no persistence, no CRUD (saved named regions are the next
  // step, deliberately not taken yet). `pinned` is the strip's click.
  const [recent, setRecent] = useState<readonly Block[]>([])
  const [pinned, setPinned] = useState<Block | null>(null)

  const cell = effectiveCell(source, tilesetName, manualCell)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragAnchor | null>(null) // { c, r } drag anchor while the mouse is down
  // The scrolling viewport around the canvas (#352) — the canvas is sized to
  // this, not to the sheet, and only the visible slice is drawn.
  const wrapRef = useRef<HTMLDivElement>(null)
  const view = useScrollView(wrapRef)

  // Bumped after every save so the roster refetches (#353: the list lives in
  // SavedObjects now).
  const [savedTick, setSavedTick] = useState(0)

  // Load a saved object back into the editor: restore its fields + painted walk
  // mask, and draw its stored art in the preview so the door/path can be placed
  // against the real building (#29/#32). Re-saving upserts by name → same record.
  const onEdit = useCallback((id: number) => {
    setStatus('Loading…')
    runEdge(TileObjectsService.get(id))
      .then(async (o: TileObjectDetail) => {
        setName(o.name)
        setKind(o.kind)
        setFpW(o.footprint_w)
        setFpH(o.footprint_h)
        setDoor(o.door_dx != null && o.door_dy != null ? { dx: o.door_dx, dy: o.door_dy } : null)
        setWalk(o.walk_mask ? walkCellsFromMask(o.walk_mask) : new Set())
        // A saved prop with a walk_mask was authored Collides-on (#338) — restore
        // the toggle so its carved cells and footprint grid show on reopen.
        setCollides(o.kind === 'prop' && o.walk_mask != null)
        setOverhangCells(o.walk_mask ? overhangCellsFromMask(o.walk_mask) : new Set())
        setLadderCells(o.walk_mask ? ladderCellsFromMask(o.walk_mask) : new Set())
        setEdgeCells(o.edge_mask ? edgeSetFromMask(o.edge_mask) : new Set())
        setActive(0)
        setPaintMode('walk')
        setLoadedFg(o.fg_mask ?? null) // restore the foreground mask into the editor
        fgMaskRef.current = null // force a rebuild against the loaded art
        setSel(null) // leave tileset-selection mode; the art/composition drives the preview

        // Draw the saved flat art into the preview — the fallback for any object
        // with no resolvable composition (cropped, uploaded, or pre-#355).
        const editFlat = (msg: string) => {
          setLayers([new Map()]) // the loaded art replaces any composition in progress
          setEditImg(null)
          const img = new Image()
          img.onload = () => { setEditImg(img); setStatus(msg) }
          img.onerror = () => setStatus('Could not load the saved image.')
          img.src = o.image
        }

        // A composed object (#355) reopens with its tiles in place, on the right
        // tilesets, ready to swap. `{}` (no composition) has no `v`. Resolving
        // means every referenced tileset still loads and its columns are known.
        const comp = o.composition && 'v' in o.composition ? (o.composition as Composition) : null
        if (!comp) {
          editFlat(`Editing "${o.name}". Add/adjust the door + walkable path, then Save.`)
          return
        }
        const names = compositionSheets(comp)
        const loaded = new Map<string, HTMLImageElement>()
        for (const [n, img] of await Promise.all(
          names.map((n) => loadImage(tilesetUrl(n)).then((img) => [n, img] as const)),
        ))
          if (img) loaded.set(n, img)
        const rebuilt = fromComposition(comp, (s) =>
          loaded.has(s) ? Math.floor(loaded.get(s)!.naturalWidth / comp.cell) : null,
        )
        if (!rebuilt) {
          // A tileset was removed/renamed since the object was composed: the art
          // still renders, so fall back to editing it flat rather than blocking.
          editFlat(`Editing "${o.name}" as flat art — its composition can't be resolved (a tileset was removed or renamed).`)
          return
        }
        setSheets((prev) => new Map([...prev, ...loaded]))
        setLayers(rebuilt)
        setEditImg(null) // the composition, not a stored crop, drives the preview
        setSource('tileset')
        setTilesetName(names.find((n) => loaded.has(n))!) // pick blocks off a source sheet
        setStatus(`Reopened "${o.name}" — swap tiles, then Save (as a new name for a variant).`)
      })
      .catch((err: unknown) => setStatus(`Load failed: ${err instanceof Error ? err.message : String(err)}`))
  }, [])

  const cols = tileset ? Math.floor(tileset.width / cell) : 0
  const rows = tileset ? Math.floor(tileset.height / cell) : 0

  // The building footprint as a whole-tile grid for the door picker.
  const isBuilding = kind === 'building'
  const isProp = kind === 'prop'
  // Objects that author a collision walk mask: a building, or a prop with
  // Collides on (#338). Drives the footprint grid, the Walkable paint, and the
  // saved walk_mask — everything a prop shares with a building's collision.
  const collidable = authorsWalkMask(kind, collides)
  const doorCols = Math.max(1, Math.round(fpW))
  const doorRows = Math.max(1, Math.round(fpH))

  // The sheet the picked block comes from, and the key its placed cells carry.
  const sheetKey = source === 'tileset' ? tilesetName : UPLOAD_SHEET

  // Normalized selection in cells (inclusive), or null.
  const selBox = sel
    ? {
        c: Math.min(sel.c0, sel.c1),
        r: Math.min(sel.r0, sel.r1),
        w: Math.abs(sel.c1 - sel.c0) + 1,
        h: Math.abs(sel.r1 - sel.r0) + 1,
        sheet: sheetKey,
      }
    : null

  // The active block is the tileset rectangle just dragged, unless a strip
  // thumbnail was clicked to pin an earlier one (#356); starting a new drag
  // hands it back to the selection.
  const block = pinned ?? selBox

  // The composition's own geometry (#353): the picked tileset rectangle is the
  // block that stamps, and the bounding box of every layer is the composed
  // art's extent (and the default footprint).
  const compBox = useMemo(() => bounds(layers), [layers])

  // Stamps and erases land on the active layer; the rest of the stack is left
  // alone (#354).
  const setActiveLayer = (next: Placed) =>
    setLayers((ls) => ls.map((l, i) => (i === active ? next : l)))

  // Adopt a freshly loaded source sheet: keep it for the composition to draw
  // from, and drop the selection (the block belongs to the sheet it was picked
  // on). What's already stamped stays — a composition may draw a wall from one
  // sheet and a sign from another (#354).
  const useSheet = useCallback((img: HTMLImageElement, key: string) => {
    setTileset({ img, width: img.naturalWidth, height: img.naturalHeight })
    setSheets((prev) => new Map(prev).set(key, img))
    setSel(null)
    wrapRef.current?.scrollTo(0, 0) // a new sheet starts at the top (#352)
    setStatus(`Loaded tileset (${img.naturalWidth}×${img.naturalHeight}). Drag to pick a block.`)
  }, [])

  // Tileset mode (#351): fetch the registry sheet from public/maps/tilesets/, so
  // building twenty objects off one sheet costs zero uploads and survives reload.
  useEffect(() => {
    if (source !== 'tileset') return
    let alive = true
    const img = new Image()
    img.onload = () => { if (alive) useSheet(img, tilesetName) }
    img.onerror = () => { if (alive) setStatus(`Could not load ${tilesetName}.png`) }
    img.src = tilesetUrl(tilesetName)
    return () => { alive = false }
  }, [source, tilesetName, useSheet])

  const onUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => useSheet(img, UPLOAD_SHEET)
      img.onerror = () => setStatus('Could not read that image.')
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }, [useSheet])

  // ---- draw the tileset + grid + selection ----------------------------
  // Windowed (#352): the canvas covers the viewport and everything below is
  // drawn in full-sheet coordinates translated by the scroll offset, so a
  // 1024×8288 sheet at 3× costs one screenful of canvas instead of ~76 MP.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !tileset || view.w === 0 || view.h === 0) return
    canvas.width = view.w
    canvas.height = view.h
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.translate(-view.x, -view.y)
    const { sx, sy, sw, sh } = visibleSlice(view, zoom, tileset.width, tileset.height)
    if (sw > 0 && sh > 0)
      ctx.drawImage(tileset.img, sx, sy, sw, sh, sx * zoom, sy * zoom, sw * zoom, sh * zoom)

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
  }, [tileset, cell, zoom, cols, rows, selBox, view])

  // ---- the composition canvas (#353) --------------------------------
  // Flatten what's placed to a native-resolution canvas; it stands in for the
  // tileset crop everywhere downstream (preview, foreground editor, save).
  useEffect(() => {
    if (!tileset || !compBox) {
      setComposed(null)
      return
    }
    const off = document.createElement('canvas')
    off.width = compBox.w * cell
    off.height = compBox.h * cell
    flatten(off.getContext('2d')!, sheets, layers, cell, compBox)
    setComposed(off)
  }, [tileset, sheets, layers, cell]) // compBox is derived from layers — one run per change

  // A stamp/erase drag on the board finished: the composition is the art now.
  // A stamp that landed on filled cells replaced them — say so, and point at the
  // layer that would have stacked instead (#354).
  function onCompCommit(replaced: boolean) {
    setEditImg(null)
    setLoadedFg(null)
    fgMaskRef.current = null
    if (replaced) setStatus('Replaced — use + Layer to stack instead.')
  }

  // The composition's bounding box is the default footprint (#353) — still
  // overridable in the Width/Height inputs until the next stamp.
  useEffect(() => {
    if (!compBox) return
    setFpW(Math.min(MAX_FP, compBox.w))
    setFpH(Math.min(MAX_FP, compBox.h))
  }, [compBox?.w, compBox?.h])

  // ---- live preview of the cropped object at map scale --------------
  const previewRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || (!composed && !editImg)) return
    const w = Math.max(1, Math.round(fpW * MAP_TILE))
    const h = Math.max(1, Math.round(fpH * MAP_TILE))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, w, h)
    // The composition is the art (#353); editing a saved object draws its
    // stored crop instead. A tileset selection alone previews nothing — it is
    // just the block waiting to be stamped.
    ctx.drawImage(composed ?? editImg!, 0, 0, w, h)

    // For a building (or a collidable prop, #338), overlay the footprint grid,
    // the painted walkable cells (#32), and the picked door cell so the admin
    // sees the authored entry path and where the entrance lands (issue #29). A
    // prop has no door/overhang/ladder/edge yet — those sets stay empty for it.
    if (!collidable) return
    const cw = w / doorCols
    const ch = h / doorRows
    ctx.fillStyle = 'rgba(46,125,255,0.35)' // painted walkable cells
    for (let r = 0; r < doorRows; r++)
      for (let c = 0; c < doorCols; c++)
        if (walk.has(`${c},${r}`)) ctx.fillRect(c * cw, r * ch, cw, ch)
    ctx.fillStyle = 'rgba(255,150,40,0.45)' // overhang cells (#44) — walk-under
    for (let r = 0; r < doorRows; r++)
      for (let c = 0; c < doorCols; c++)
        if (overhangCells.has(`${c},${r}`)) ctx.fillRect(c * cw, r * ch, cw, ch)
    ctx.fillStyle = 'rgba(150,90,255,0.5)' // ladder cells (#54) — climb-while-on
    for (let r = 0; r < doorRows; r++)
      for (let c = 0; c < doorCols; c++)
        if (ladderCells.has(`${c},${r}`)) ctx.fillRect(c * cw, r * ch, cw, ch)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    for (let c = 1; c < doorCols; c++) ctx.strokeRect(c * cw + 0.5, 0, 0, h)
    for (let r = 1; r < doorRows; r++) ctx.strokeRect(0, r * ch + 0.5, w, 0)
    if (door) {
      ctx.fillStyle = 'rgba(46,200,90,0.45)'
      ctx.fillRect(door.dx * cw, door.dy * ch, cw, ch)
    }
    // Impassable cell borders (#53) — a thick red line on each marked side.
    ctx.strokeStyle = '#e23232'
    ctx.lineWidth = 4
    for (const key of edgeCells) {
      const [c, r, side] = key.split(',')
      const x = Number(c) * cw
      const y = Number(r) * ch
      ctx.beginPath()
      if (side === 'N') { ctx.moveTo(x, y); ctx.lineTo(x + cw, y) }
      else if (side === 'S') { ctx.moveTo(x, y + ch); ctx.lineTo(x + cw, y + ch) }
      else if (side === 'W') { ctx.moveTo(x, y); ctx.lineTo(x, y + ch) }
      else { ctx.moveTo(x + cw, y); ctx.lineTo(x + cw, y + ch) }
      ctx.stroke()
    }
  }, [editImg, composed, fpW, fpH, collidable, doorCols, doorRows, door, walk, overhangCells, ladderCells, edgeCells])

  // Click the preview to either mark the entrance (door mode) or toggle a
  // walkable cell (walk mode) — issue #29/#32.
  function onPreviewClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = previewRef.current!.getBoundingClientRect()
    if (!collidable) return
    // Edge mode (#53) toggles the nearest border of the clicked cell.
    if (paintMode === 'edge') {
      const e2 = edgeSideFromClick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, doorCols, doorRows)
      setEdgeCells((prev) => {
        const next = new Set(prev)
        const key = `${e2.c},${e2.r},${e2.side}`
        next.has(key) ? next.delete(key) : next.add(key)
        return next
      })
      return
    }
    const cell = doorCellFromClick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, doorCols, doorRows)
    if (paintMode === 'door') {
      // Clicking the placed door again removes it — a door-less building is
      // legal since #343, so the door must be un-placeable too.
      setDoor((prev) => (prev && prev.dx === cell.dx && prev.dy === cell.dy ? null : cell))
      return
    }
    // Overhang mode (#44) toggles walk-under cells; walk mode toggles porch cells.
    const key = `${cell.dx},${cell.dy}`
    if (paintMode === 'overhang') {
      setOverhangCells((prev) => {
        const next = new Set(prev)
        next.has(key) ? next.delete(key) : next.add(key)
        return next
      })
      return
    }
    // Ladder mode (#54) toggles climb cells; mutually exclusive with porch/overhang.
    if (paintMode === 'ladder') {
      setLadderCells((prev) => {
        const next = new Set(prev)
        next.has(key) ? next.delete(key) : next.add(key)
        return next
      })
      return
    }
    setWalk((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ---- drag-select on the canvas ------------------------------------
  function cellAt(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    // The canvas only covers the viewport, so add the scroll offset back (#352).
    return cellAtPoint(e.clientX - rect.left, e.clientY - rect.top, view, cell * zoom, cols, rows)
  }
  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!tileset) return
    const { c, r } = cellAt(e)
    dragRef.current = { c, r }
    setPinned(null) // a fresh drag takes the block back off the strip (#356)
    setSel({ c0: c, r0: r, c1: c, r1: r })
  }
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return
    const { c, r } = cellAt(e)
    setSel({ c0: dragRef.current.c, r0: dragRef.current.r, c1: c, r1: r })
  }
  function onUp() {
    if (!dragRef.current) return // a stray mouseup (leaving the canvas) isn't a pick
    dragRef.current = null
    // The tileset selection is only ever the block to stamp (#353) — the object's
    // art comes from the composition, never straight from this rectangle. Every
    // finished pick joins the recent strip so it can be re-picked (#356).
    if (!selBox) return
    setRecent((r) => remember(r, selBox))
    setStatus(`Block ${selBox.w}×${selBox.h}. Click the composition to stamp it, or drag to repeat it.`)
  }

  async function onSave() {
    if (!composed && !editImg) {
      setStatus('Compose the object first — pick a block on the tileset, then stamp it.')
      return
    }
    if (!name.trim()) {
      setStatus('Give the object a name.')
      return
    }
    // A building with a door must ship an authored, reachable interior walk mask
    // (#32): a door + at least one walkable tile + a path connecting them to a
    // footprint edge, so the avatar can actually enter. Block the save otherwise.
    // A door-less building (#343) is pure scenery — its footprint saves as a
    // solid box and skips the guard (the hometown fallback door still applies at
    // runtime). A collidable prop (#338) carries a mask too, but has no door, so
    // it also skips the guard and saves exactly as painted.
    const mask = collidable ? buildWalkMask(walk, doorCols, doorRows, overhangCells, ladderCells) : undefined
    if (requiresDoorValidation(kind, door)) {
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
    // The composition flattens to the standalone PNG the object ships (#353),
    // exactly as the old crop path did; in edit mode the art already is one.
    const image = composed ? composed.toDataURL('image/png') : editImg!.src

    // Store the composition beside the art (#355) so the object can be reopened
    // and remixed. Only when it was composed here (a flat re-save keeps the
    // server's stored one) and every tile came from a loaded registry tileset —
    // an upload-sourced composition could never be reopened, so we don't persist
    // a guaranteed-dangling note (ADR-0014). `ts`'s columns come off the sheet.
    const usedSheets = new Set<string>()
    for (const layer of layers) for (const [, [, , sheet]] of layer) usedSheets.add(sheet)
    const reopenable =
      composed != null &&
      compBox != null &&
      usedSheets.size > 0 &&
      [...usedSheets].every((s) => s !== UPLOAD_SHEET && sheets.has(s))
    const composition = reopenable
      ? toComposition(layers, cell, compBox!, (s) => Math.floor(sheets.get(s)!.naturalWidth / cell))
      : undefined

    setStatus('Saving…')
    try {
      const obj = await runEdge(TileObjectsWrite.save({
        name: name.trim(),
        kind,
        image,
        footprint_w: Math.min(MAX_FP, Number(fpW) || compBox?.w || 1),
        footprint_h: Math.min(MAX_FP, Number(fpH) || compBox?.h || 1),
        // Building entrance, when picked. An explicit null clears a previously
        // saved door (the server keeps the old value when the key is absent);
        // the town then falls back to its hardcoded bottom-centre entrance.
        door_dx: isBuilding ? (door ? door.dx : null) : undefined,
        door_dy: isBuilding ? (door ? door.dy : null) : undefined,
        // Authored interior walk mask (#32) — only for buildings, validated above.
        walk_mask: mask,
        // Impassable cell borders (#53) — only when the admin marked some, so an
        // unauthored building stays fully backward-compatible (free movement).
        edge_mask: collidable && edgeCells.size ? buildEdgeMask(edgeCells, doorCols, doorRows) : undefined,
        // Foreground mask (#36) — the painted overlay's alpha as a PNG, only
        // when the admin actually painted some in-front pixels.
        fg_mask: isBuilding && maskHasInk(fgMaskRef.current) ? fgMaskRef.current!.toDataURL('image/png') : undefined,
        // Composition (#355) — the editor-only rebuild note, when reopenable.
        composition,
      }))
      setStatus(`Saved "${obj.name}" as the active ${obj.kind}. It'll show on the map on reload.`)
      setSavedTick((t) => t + 1)
    } catch (err: unknown) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ---- foreground mask authoring (#36) ------------------------------
  // The building art at native resolution — the surface the admin paints over
  // and the wand reads colours from: the composition, or a saved object's crop.
  const buildFgSource = useCallback((): HTMLCanvasElement | null => {
    if (composed) return composed
    if (!editImg) return null
    const c = document.createElement('canvas')
    c.width = editImg.naturalWidth
    c.height = editImg.naturalHeight
    c.getContext('2d')!.drawImage(editImg, 0, 0)
    return c
  }, [composed, editImg])

  return (
    <div className="tilemapper">
      <header className="bar">
        <h1>Tile-Object Mapper</h1>
        <label>
          Source
          <select value={source} onChange={(e) => { setSource(e.target.value as Source); setSel(null) }}>
            <option value="tileset">Tileset</option>
            <option value="upload">Upload PNG</option>
          </select>
        </label>
        {source === 'tileset' ? (
          <label>
            Tileset
            <select value={tilesetName} onChange={(e) => setTilesetName(e.target.value)}>
              {TILESETS.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="upload">
              Tileset PNG
              <input type="file" accept="image/png" onChange={onUpload} />
            </label>
            <label>
              Cell
              <input
                type="number"
                min={1}
                value={manualCell}
                onChange={(e) => { setManualCell(Math.max(1, Number(e.target.value) || 1)); setSel(null) }}
                style={{ width: 52 }}
              />
            </label>
          </>
        )}
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
          <div className="canvas-wrap" ref={wrapRef}>
            {tileset ? (
              // The spacer carries the full sheet extent so the wrapper scrolls
              // it all; the canvas sticks to the viewport and redraws (#352).
              <div
                className="canvas-spacer"
                style={{ width: tileset.width * zoom, height: tileset.height * zoom }}
              >
                <canvas
                  ref={canvasRef}
                  onMouseDown={onDown}
                  onMouseMove={onMove}
                  onMouseUp={onUp}
                  onMouseLeave={onUp}
                />
              </div>
            ) : (
              <div className="empty">No tileset loaded.</div>
            )}
          </div>
        </div>

        <CompositionPane
          sheets={sheets}
          cell={cell}
          block={block}
          recent={recent}
          placed={layers[active]}
          layerCount={layers.length}
          active={active}
          box={compBox}
          composed={composed}
          onChange={setActiveLayer}
          onClear={() => { setLayers([new Map()]); setActive(0) }}
          onAddLayer={() => { setLayers((ls) => [...ls, new Map()]); setActive(layers.length) }}
          onPickLayer={setActive}
          onCommit={onCompCommit}
          onNeedBlock={() => setStatus('Drag a rectangle on the tileset first — that block is what stamps.')}
          onPickRecent={(b) => {
            setPinned(b)
            setSel(null) // the highlight belongs to the sheet the drag was on, not this block
            setStatus(`Block ${b.w}×${b.h} from ${b.sheet}. Click the composition to stamp it.`)
          }}
          // Dropping a thumbnail only forgets the shortcut; a dropped block that
          // was pinned stays armed until something else is picked.
          onDropRecent={(b) => setRecent((r) => r.filter((x) => !sameBlock(x, b)))}
        />

        <div className="right">
          <h3>Object</h3>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => { setKind(e.target.value); setDoor(null); setWalk(new Set()); setOverhangCells(new Set()); setLadderCells(new Set()); setEdgeCells(new Set()); setCollides(false); setPaintMode('walk') }}>
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
              <input type="number" min={0.25} max={MAX_FP} step={0.1} value={fpW}
                onChange={(e) => setFpW(Math.min(MAX_FP, Number(e.target.value) || 1))} style={{ width: 64 }} />
            </label>
            <label>
              Height (tiles)
              <input type="number" min={0.25} max={MAX_FP} step={0.1} value={fpH}
                onChange={(e) => setFpH(Math.min(MAX_FP, Number(e.target.value) || 1))} style={{ width: 64 }} />
            </label>
          </div>
          {isProp && (
            <label className="collides-toggle">
              <input type="checkbox" checked={collides} onChange={(e) => setCollides(e.target.checked)} />
              Collides — the footprint blocks the avatar; paint Walkable to carve pass-through cells.
            </label>
          )}

          <h3>Preview (map scale)</h3>
          <div className="preview-box">
            {composed || editImg ? <canvas ref={previewRef} onClick={onPreviewClick} /> : <p className="hint">Stamp a block onto the composition, or Edit a saved object.</p>}
          </div>
          {(composed || (collidable && editImg)) && (
            <>
              <div className="paint-mode">
                <span>Paint:</span>
                {collidable && (
                  <button
                    type="button"
                    className={paintMode === 'walk' ? 'is-on' : ''}
                    onClick={() => setPaintMode('walk')}
                  >
                    Walkable
                  </button>
                )}
                {collidable && (
                  <button
                    type="button"
                    className={paintMode === 'overhang' ? 'is-on' : ''}
                    onClick={() => setPaintMode('overhang')}
                  >
                    Overhang
                  </button>
                )}
                {collidable && (
                  <button
                    type="button"
                    className={paintMode === 'ladder' ? 'is-on' : ''}
                    onClick={() => setPaintMode('ladder')}
                  >
                    Ladder
                  </button>
                )}
                {collidable && (
                  <button
                    type="button"
                    className={paintMode === 'edge' ? 'is-on' : ''}
                    onClick={() => setPaintMode('edge')}
                  >
                    Edge
                  </button>
                )}
                {isBuilding && (
                  <button
                    type="button"
                    className={paintMode === 'door' ? 'is-on' : ''}
                    onClick={() => setPaintMode('door')}
                  >
                    Door
                  </button>
                )}
                {isBuilding && (
                  <button
                    type="button"
                    className={paintMode === 'fg' ? 'is-on' : ''}
                    onClick={() => setPaintMode('fg')}
                  >
                    Foreground
                  </button>
                )}
              </div>
              {collidable && paintMode === 'overhang' && (
                <p className="hint">
                  Click cells the avatar walks <strong>under</strong> the art (overhang/foliage — a tree canopy,
                  a lamppost). Walkable, but drawn beneath the object. {overhangCells.size} marked.
                </p>
              )}
              {collidable && paintMode === 'ladder' && (
                <p className="hint">
                  Click cells to mark a <strong>ladder</strong> — walkable like a path, but the avatar plays its
                  climb animation while on it (falls back to walking if the character has no climb frames).
                  {' '}{ladderCells.size} marked.
                </p>
              )}
              {collidable && paintMode === 'edge' && (
                <p className="hint">
                  Click near a cell <strong>side</strong> to wall it off — the avatar can't step across that border
                  (a ledge/balcony edge), even between two walkable cells. {edgeCells.size} marked.
                </p>
              )}
              {isBuilding && (paintMode === 'walk' || paintMode === 'door') && (
                <p className="hint">
                  {paintMode === 'walk'
                    ? 'Click cells to paint the walkable porch/path (toggle).'
                    : 'Click the entrance cell; click the placed door again to remove it.'}{' '}
                  {door
                    ? `Door at ${door.dx},${door.dy}. Save is blocked until the door is reachable from a footprint edge via walkable tiles.`
                    : 'No door — saves as solid scenery.'}
                </p>
              )}
              {isProp && collidable && paintMode === 'walk' && (
                <p className="hint">
                  The footprint <strong>blocks</strong> the avatar. Click cells to carve walkable
                  pass-through (toggle) — a prop has no door, so the mask saves exactly as painted.
                  {' '}{walk.size} carved.
                </p>
              )}
              {isBuilding && paintMode === 'fg' && (
                <ForegroundEditor buildSource={buildFgSource} loaded={loadedFg} maskRef={fgMaskRef} />
              )}
            </>
          )}

          <button type="button" className="save" onClick={onSave} disabled={!composed && !editImg}>
            Save to server
          </button>

          <SavedObjects reloadKey={savedTick} onEdit={onEdit} onError={setStatus} />
        </div>
      </div>
    </div>
  )
}
