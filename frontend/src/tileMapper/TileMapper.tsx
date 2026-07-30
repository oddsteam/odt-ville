import { useCallback, useEffect, useRef, useState } from 'react'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import { TileObjectsWrite } from '../catalog/tileObjects/write.ts'
import type { TileObject, TileObjectSummary } from '../catalog/tileObjects/schema.ts'
import { runEdge } from '../lib/runEdge.ts'
import { validateWalkMask, EDGE_N, EDGE_E, EDGE_S, EDGE_W } from '../kernel/walkMask.ts'
import '../lib/mapperChrome.css'

type Atlas = { img: HTMLImageElement; src: string; width: number; height: number }
type Sel = { c0: number; r0: number; c1: number; r1: number }
type DragAnchor = { c: number; r: number }

// Tile-Object Mapper — admins upload an atlas PNG, drag a rectangle over the
// cell grid to select a whole object (a tree, a prop), then save it. The
// browser crops that region to a standalone PNG (data URL) so the game just
// draws one image; the atlas never has to ship to the game. See the Rails
// tile_objects API + TownScene's tall-prop overlay.

const MAP_TILE = 48 // px per tile in the game — used to preview real map size.
const MAX_FP = 15 // largest building footprint, in tiles (15×15 cap).
const FG_HISTORY_CAP = 30 // foreground-mask undo depth (#50). ponytail: cap, raise if authors hit it.

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
export function buildWalkMask(
  walk: ReadonlySet<string>,
  cols: number,
  rows: number,
  overhang: ReadonlySet<string> = new Set(),
  ladder: ReadonlySet<string> = new Set(),
): string[] {
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    // 'o' overhang (#44, avatar under) > 'L' ladder (#54, climb) > '.' porch; else '#'.
    for (let c = 0; c < cols; c++) {
      const k = `${c},${r}`
      row += overhang.has(k) ? 'o' : ladder.has(k) ? 'L' : walk.has(k) ? '.' : '#'
    }
    out.push(row)
  }
  return out
}

// Which tile objects author a collision walk mask (#338). A building always
// carries one (footprint solid except its authored porch/path, #32). A prop
// carries one only when Collides is on — then its footprint blocks like a
// building and the Walkable paint mode carves pass-through cells. Every other
// kind (and a plain prop) is walk-over and saves no mask (ADR-0008: a placed
// entity blocks nothing by default).
export function authorsWalkMask(kind: string, collides: boolean): boolean {
  return kind === 'building' || (kind === 'prop' && collides)
}

// Which tile objects run the building door-reachability guard (validateWalkMask,
// #32) at save. Only a building, and only once a door is actually placed (#343):
// a door-less building is pure scenery — its footprint saves as a solid box and
// the hometown fallback bottom-centre door still applies at runtime. A placed
// door, though, must reach a footprint edge (an unreachable door is always a
// mistake), so it keeps the existing block. A collidable prop has no door, so
// its mask saves exactly as painted; this is the no-door validation split of
// #338/#343.
export function requiresDoorValidation(
  kind: string,
  door: { dx: number; dy: number } | null | undefined,
): boolean {
  return kind === 'building' && door != null
}

// The 'o' overhang cells of a stored mask (#44), as "dx,dy" keys — so a saved
// building loads back into the editor with its overhang painting intact.
export function overhangCellsFromMask(mask: readonly string[]): Set<string> {
  const out = new Set<string>()
  mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === 'o') out.add(`${c},${r}`)
  })
  return out
}

// The 'L' ladder cells of a stored mask (#54), as "dx,dy" keys — so a saved
// building loads back into the editor with its ladder painting intact.
export function ladderCellsFromMask(mask: readonly string[]): Set<string> {
  const out = new Set<string>()
  mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === 'L') out.add(`${c},${r}`)
  })
  return out
}

// Crop the atlas selection to a standalone PNG, clearing any erased cells to
// transparent (#43). `erase` holds "c,r" cell offsets within the selection;
// each gets wiped so neighbour-sprite bleed inside the bounding box doesn't
// ship in the saved object. Empty erase set → a plain drawImage crop.
export function cropSelection(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sel: { c: number; r: number; w: number; h: number },
  cell: number,
  erase: ReadonlySet<string>,
): void {
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, sel.c * cell, sel.r * cell, sel.w * cell, sel.h * cell, 0, 0, sel.w * cell, sel.h * cell)
  for (let r = 0; r < sel.h; r++)
    for (let c = 0; c < sel.w; c++)
      if (erase.has(`${c},${r}`)) ctx.clearRect(c * cell, r * cell, cell, cell)
}

// Impassable cell borders (#53): bit per side, matching town.ts's edge mask.
const SIDE_BIT: Record<string, number> = { N: EDGE_N, E: EDGE_E, S: EDGE_S, W: EDGE_W }

// Turn the painted set of "c,r,side" borders into the row-major hex edge mask
// the town stamps (#53): one hex digit per cell whose bits mark blocked sides.
// Marks outside the cols×rows footprint are dropped.
export function buildEdgeMask(edges: ReadonlySet<string>, cols: number, rows: number): string[] {
  const bits: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (const key of edges) {
    const [c, r, side] = key.split(',')
    const x = Number(c)
    const y = Number(r)
    if (x < 0 || x >= cols || y < 0 || y >= rows || !SIDE_BIT[side]) continue
    bits[y][x] |= SIDE_BIT[side]
  }
  return bits.map((row) => row.map((b) => b.toString(16)).join(''))
}

// Inverse of buildEdgeMask — a stored hex edge mask back into the painted set of
// "c,r,side" keys, so a saved building loads into the editor with its borders.
export function edgeSetFromMask(mask: readonly string[]): Set<string> {
  const out = new Set<string>()
  mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const bits = parseInt(row[c], 16)
      for (const side of Object.keys(SIDE_BIT)) if (bits & SIDE_BIT[side]) out.add(`${c},${r},${side}`)
    }
  })
  return out
}

// Map a click on the footprint preview to the nearest side of the clicked cell
// (#53) — whichever of top/bottom/left/right edge the click lands closest to.
export function edgeSideFromClick(
  px: number, py: number, rectW: number, rectH: number, cols: number, rows: number,
): { c: number; r: number; side: 'N' | 'E' | 'S' | 'W' } {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, Math.floor(v)))
  const fx = (px / rectW) * cols
  const fy = (py / rectH) * rows
  const c = clamp(fx, cols)
  const r = clamp(fy, rows)
  const dN = fy - r // distance to top edge
  const dS = r + 1 - fy
  const dW = fx - c
  const dE = c + 1 - fx
  const min = Math.min(dN, dS, dW, dE)
  const side = min === dN ? 'N' : min === dS ? 'S' : min === dW ? 'W' : 'E'
  return { c, r, side }
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

// Magic-wand select (#36): the 4-connected run of pixels whose colour is within
// `tolerance` (max per-channel abs diff, alpha included) of the seed pixel.
// Returns pixel indices (y*width + x). Pure over an RGBA buffer so it's unit-
// testable without a canvas; the foreground editor feeds it getImageData().
export function floodSelect(
  data: Uint8ClampedArray, width: number, height: number, sx: number, sy: number, tolerance: number,
): number[] {
  const at = (x: number, y: number) => y * width + x
  const s = at(sx, sy) * 4
  const within = (p: number) =>
    Math.abs(data[p] - data[s]) <= tolerance &&
    Math.abs(data[p + 1] - data[s + 1]) <= tolerance &&
    Math.abs(data[p + 2] - data[s + 2]) <= tolerance &&
    Math.abs(data[p + 3] - data[s + 3]) <= tolerance
  const seen = new Uint8Array(width * height)
  const out: number[] = []
  const stack: Array<[number, number]> = [[sx, sy]]
  seen[at(sx, sy)] = 1
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (!within(at(x, y) * 4)) continue
    out.push(at(x, y))
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[at(nx, ny)]) continue
      seen[at(nx, ny)] = 1
      stack.push([nx, ny])
    }
  }
  return out
}

// Mouse → source-pixel on the foreground view canvas (#51). getBoundingClientRect
// is the *border* box, so shift past the border and scale by the *content* box,
// not the border box — otherwise the brush lands offset from the cursor when the
// canvas is CSS-scaled to fit and carries a 1px border. Clamped to the source.
export function viewToSourcePixel(
  clientX: number, clientY: number,
  rect: { left: number; top: number },
  border: { left: number; top: number },
  content: { width: number; height: number },
  srcW: number, srcH: number,
): { x: number; y: number } {
  const x = Math.floor(((clientX - rect.left - border.left) / content.width) * srcW)
  const y = Math.floor(((clientY - rect.top - border.top) / content.height) * srcH)
  return {
    x: Math.max(0, Math.min(srcW - 1, x)),
    y: Math.max(0, Math.min(srcH - 1, y)),
  }
}

// True if a mask canvas has any painted (non-transparent) pixel — so we only
// ship a foreground mask (#36) when the admin actually authored one.
function maskHasInk(c: HTMLCanvasElement | null): boolean {
  if (!c) return false
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true
  return false
}

export default function TileMapper() {
  const [atlas, setAtlas] = useState<Atlas | null>(null) // { img, src, width, height }
  const [cell, setCell] = useState(32)
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
  // Erased cells for the current atlas selection (#43) — "c,r" offsets within
  // the selection box; cleared to transparent in the saved crop so neighbour
  // sprites caught in the bounding box don't ship.
  const [erase, setErase] = useState<ReadonlySet<string>>(new Set())
  const [paintMode, setPaintMode] = useState<'walk' | 'door' | 'erase' | 'fg' | 'overhang' | 'ladder' | 'edge'>('walk')
  // Foreground mask authoring (#36) — paint over the building art which pixels
  // render in front of the avatar. Held as two offscreen canvases: the building
  // art (source, for wand colour reads) and the mask (magenta where painted; its
  // alpha is what ships + drives the in-game BitmapMask). fgTick forces a redraw.
  const [fgTool, setFgTool] = useState<'brush' | 'wand' | 'erase'>('wand')
  const [fgSize, setFgSize] = useState(8) // brush/eraser radius, in source px
  const [fgTol, setFgTol] = useState(24) // wand colour tolerance
  const [fgTick, setFgTick] = useState(0)
  // Live cursor pixel (#51) and per-action undo history (#50) for the fg editor.
  const [fgCursor, setFgCursor] = useState<{ x: number; y: number } | null>(null)
  const [fgHistory, setFgHistory] = useState<ImageData[]>([])
  const [loadedFg, setLoadedFg] = useState<string | null>(null) // saved mask to restore
  const fgSrcRef = useRef<HTMLCanvasElement | null>(null)
  const fgMaskRef = useRef<HTMLCanvasElement | null>(null)
  const fgViewRef = useRef<HTMLCanvasElement>(null)
  const fgDrawingRef = useRef(false)
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
    runEdge(TileObjectsService.list()).then(setSaved).catch(() => {})
  }, [])
  useEffect(() => refreshSaved(), [refreshSaved])

  const onActivate = useCallback(
    (id: number) => {
      runEdge(TileObjectsWrite.activate(id))
        .then(() => refreshSaved())
        .catch((err: unknown) => setStatus(`Activate failed: ${err instanceof Error ? err.message : String(err)}`))
    },
    [refreshSaved],
  )

  const onDeactivate = useCallback(
    (id: number) => {
      runEdge(TileObjectsWrite.deactivate(id))
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
      runEdge(TileObjectsWrite.del(o.id))
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
    runEdge(TileObjectsService.get(id))
      .then((o: TileObject) => {
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
        setErase(new Set())
        setPaintMode('walk')
        setLoadedFg(o.fg_mask ?? null) // restore the foreground mask into the editor
        fgMaskRef.current = null // force a rebuild against the loaded art
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
  const isProp = kind === 'prop'
  // Objects that author a collision walk mask: a building, or a prop with
  // Collides on (#338). Drives the footprint grid, the Walkable paint, and the
  // saved walk_mask — everything a prop shares with a building's collision.
  const collidable = authorsWalkMask(kind, collides)
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
        setErase(new Set())
        setEditImg(null) // a fresh atlas leaves saved-object edit mode
        setLoadedFg(null)
        fgMaskRef.current = null // a fresh atlas starts with no foreground mask
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

    // Erased cells (#43) overlay on the atlas-selection grid — red so the admin
    // sees what won't ship. Independent of the footprint/door grid below.
    if (selBox && erase.size) {
      const ew = w / selBox.w
      const eh = h / selBox.h
      ctx.fillStyle = 'rgba(220,50,50,0.5)'
      for (let r = 0; r < selBox.h; r++)
        for (let c = 0; c < selBox.w; c++)
          if (erase.has(`${c},${r}`)) ctx.fillRect(c * ew, r * eh, ew, eh)
    }

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
  }, [atlas, cell, selBox, editImg, fpW, fpH, collidable, doorCols, doorRows, door, walk, overhangCells, ladderCells, edgeCells, erase])

  // Click the preview to either mark the entrance (door mode) or toggle a
  // walkable cell (walk mode) — issue #29/#32.
  function onPreviewClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = previewRef.current!.getBoundingClientRect()
    // Erase toggles a cell on the atlas-selection grid (#43) — works for any
    // kind, but only for a fresh selection (edit mode's art is already cropped).
    if (paintMode === 'erase' && selBox) {
      const cell = doorCellFromClick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, selBox.w, selBox.h)
      setErase((prev) => {
        const next = new Set(prev)
        const key = `${cell.dx},${cell.dy}`
        next.has(key) ? next.delete(key) : next.add(key)
        return next
      })
      return
    }
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
      setDoor(cell)
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
    setErase(new Set()) // erased cells are per-selection — a new box starts clean
    setLoadedFg(null)
    fgMaskRef.current = null // a new selection starts with a clean foreground mask
    // Default the footprint to the selected cell span (1 cell ≈ 1 tile), which
    // the admin can then tune for how big it should read on the map.
    setFpW(Math.min(MAX_FP, selBox.w))
    setFpH(Math.min(MAX_FP, selBox.h))
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
    // In edit mode the art is already a standalone PNG; otherwise crop the atlas
    // selection to one at native pixel size.
    let image: string
    if (editImg) {
      image = editImg.src
    } else {
      const off = document.createElement('canvas')
      off.width = selBox!.w * cell
      off.height = selBox!.h * cell
      cropSelection(off.getContext('2d')!, atlas!.img, selBox!, cell, erase)
      image = off.toDataURL('image/png')
    }

    setStatus('Saving…')
    try {
      const obj = await runEdge(TileObjectsWrite.save({
        name: name.trim(),
        kind,
        image,
        footprint_w: Math.min(MAX_FP, Number(fpW) || selBox?.w || 1),
        footprint_h: Math.min(MAX_FP, Number(fpH) || selBox?.h || 1),
        // Building entrance, when picked. Unsent → the town defaults to
        // bottom-centre (its existing hardcoded door).
        door_dx: isBuilding && door ? door.dx : undefined,
        door_dy: isBuilding && door ? door.dy : undefined,
        // Authored interior walk mask (#32) — only for buildings, validated above.
        walk_mask: mask,
        // Impassable cell borders (#53) — only when the admin marked some, so an
        // unauthored building stays fully backward-compatible (free movement).
        edge_mask: collidable && edgeCells.size ? buildEdgeMask(edgeCells, doorCols, doorRows) : undefined,
        // Foreground mask (#36) — the painted overlay's alpha as a PNG, only
        // when the admin actually painted some in-front pixels.
        fg_mask: isBuilding && maskHasInk(fgMaskRef.current) ? fgMaskRef.current!.toDataURL('image/png') : undefined,
      }))
      setStatus(`Saved "${obj.name}" as the active ${obj.kind}. It'll show on the map on reload.`)
      refreshSaved()
    } catch (err: unknown) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ---- foreground mask authoring (#36) ------------------------------
  // The building art at native resolution — the surface the admin paints over
  // and the wand reads colours from. Editing a saved object → its loaded crop;
  // a fresh selection → the same crop that gets saved (erased cells included).
  const buildFgSource = useCallback((): HTMLCanvasElement | null => {
    const c = document.createElement('canvas')
    if (editImg) {
      c.width = editImg.naturalWidth
      c.height = editImg.naturalHeight
      c.getContext('2d')!.drawImage(editImg, 0, 0)
      return c
    }
    if (atlas && selBox) {
      c.width = selBox.w * cell
      c.height = selBox.h * cell
      cropSelection(c.getContext('2d')!, atlas.img, selBox, cell, erase)
      return c
    }
    return null
  }, [editImg, atlas, selBox, cell, erase])

  // Build/refresh the source + mask canvases when foreground mode opens or the
  // art changes; restore a loaded mask onto the (matching-size) mask canvas.
  useEffect(() => {
    if (paintMode !== 'fg' || !isBuilding) return
    const src = buildFgSource()
    if (!src) return
    fgSrcRef.current = src
    let mask = fgMaskRef.current
    if (!mask || mask.width !== src.width || mask.height !== src.height) {
      mask = document.createElement('canvas')
      mask.width = src.width
      mask.height = src.height
      fgMaskRef.current = mask
      setFgHistory([]) // art changed → can't undo past this baseline (#50)
      if (loadedFg) {
        const img = new Image()
        img.onload = () => {
          mask!.getContext('2d')!.drawImage(img, 0, 0, mask!.width, mask!.height)
          setFgTick((t) => t + 1)
        }
        img.src = loadedFg
      }
    }
    setFgTick((t) => t + 1)
  }, [paintMode, isBuilding, buildFgSource, loadedFg])

  // Redraw the scaled view: the building art with the painted mask tinted over it.
  useEffect(() => {
    const view = fgViewRef.current
    const src = fgSrcRef.current
    const mask = fgMaskRef.current
    if (paintMode !== 'fg' || !view || !src || !mask) return
    const zoom = Math.max(1, Math.min(6, Math.floor(480 / src.width)))
    view.width = src.width * zoom
    view.height = src.height * zoom
    const ctx = view.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, view.width, view.height)
    ctx.drawImage(src, 0, 0, view.width, view.height)
    ctx.globalAlpha = 0.5
    ctx.drawImage(mask, 0, 0, view.width, view.height)
    ctx.globalAlpha = 1
    // Live cursor (#51): the disc the brush/eraser will paint (centred on the
    // same source pixel fgStamp uses), or a crosshair for the wand's seed pixel.
    if (fgCursor) {
      const cx = fgCursor.x * zoom
      const cy = fgCursor.y * zoom
      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (fgTool === 'wand') {
        ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy)
        ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6)
      } else {
        ctx.arc(cx, cy, fgSize * zoom, 0, Math.PI * 2)
      }
      ctx.stroke()
    }
  }, [paintMode, fgTick, fgCursor, fgTool, fgSize])

  // Mouse → source-pixel coords on the foreground view canvas.
  function fgPixel(e: React.MouseEvent<HTMLCanvasElement>) {
    const view = fgViewRef.current!
    const src = fgSrcRef.current!
    const rect = view.getBoundingClientRect()
    return viewToSourcePixel(
      e.clientX, e.clientY, rect,
      { left: view.clientLeft, top: view.clientTop },
      { width: view.clientWidth, height: view.clientHeight },
      src.width, src.height,
    )
  }
  // Brush/eraser: a filled disc on the mask (magenta, or punched out to erase).
  function fgStamp(x: number, y: number) {
    const ctx = fgMaskRef.current!.getContext('2d')!
    ctx.globalCompositeOperation = fgTool === 'erase' ? 'destination-out' : 'source-over'
    ctx.fillStyle = 'rgba(255,0,255,1)'
    ctx.beginPath()
    ctx.arc(x, y, fgSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
  // Magic wand: flood the source by colour, paint that run onto the mask.
  function fgWand(x: number, y: number) {
    const src = fgSrcRef.current!
    const mask = fgMaskRef.current!
    const sdata = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data
    const region = floodSelect(sdata, src.width, src.height, x, y, fgTol)
    const mctx = mask.getContext('2d')!
    const md = mctx.getImageData(0, 0, mask.width, mask.height)
    for (const i of region) {
      const p = i * 4
      md.data[p] = 255
      md.data[p + 1] = 0
      md.data[p + 2] = 255
      md.data[p + 3] = 255
    }
    mctx.putImageData(md, 0, 0)
  }
  // Snapshot the mask before an action so undo can restore it (#50). One push per
  // action — onFgDown only — makes a brush/eraser stroke or a wand fill one step.
  function pushFgHistory() {
    const mask = fgMaskRef.current!
    const snap = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height)
    setFgHistory((h) => [...h, snap].slice(-FG_HISTORY_CAP))
  }
  const onFgUndo = useCallback(() => {
    setFgHistory((h) => {
      if (!h.length) return h
      const mask = fgMaskRef.current
      if (mask) mask.getContext('2d')!.putImageData(h[h.length - 1], 0, 0)
      return h.slice(0, -1)
    })
    setFgTick((t) => t + 1)
  }, [])
  function onFgDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!fgSrcRef.current || !fgMaskRef.current) return
    pushFgHistory()
    fgDrawingRef.current = true
    const { x, y } = fgPixel(e)
    fgTool === 'wand' ? fgWand(x, y) : fgStamp(x, y)
    setFgTick((t) => t + 1)
  }
  function onFgMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!fgSrcRef.current) return
    const { x, y } = fgPixel(e)
    setFgCursor({ x, y })
    if (!fgDrawingRef.current || fgTool === 'wand') return
    fgStamp(x, y)
    setFgTick((t) => t + 1)
  }
  function onFgUp() {
    fgDrawingRef.current = false
  }

  // Cmd/Ctrl+Z undoes while the foreground editor is open (#50).
  useEffect(() => {
    if (paintMode !== 'fg' || !isBuilding) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        onFgUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paintMode, isBuilding, onFgUndo])

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
            {selBox || editImg ? <canvas ref={previewRef} onClick={onPreviewClick} /> : <p className="hint">Drag a rectangle on the atlas, or Edit a saved object.</p>}
          </div>
          {(selBox || (collidable && editImg)) && (
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
                {selBox && (
                  <button
                    type="button"
                    className={paintMode === 'erase' ? 'is-on' : ''}
                    onClick={() => setPaintMode('erase')}
                  >
                    Erase
                  </button>
                )}
              </div>
              {paintMode === 'erase' && (
                <p className="hint">
                  Click cells inside the selection to drop them (toggle). {erase.size} erased — they save transparent.
                </p>
              )}
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
                    : 'Click the entrance cell.'}{' '}
                  {door ? `Door at ${door.dx},${door.dy}.` : 'No door yet.'} Save is blocked until the door
                  is reachable from a footprint edge via walkable tiles.
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
                <div className="fg-editor">
                  <p className="hint">
                    Mark the house pixels that render <strong>in front of</strong> the avatar (foliage, eaves).
                    Wand = flood-select by colour; Brush/Eraser = freehand.
                  </p>
                  <div className="fg-tools">
                    {(['wand', 'brush', 'erase'] as const).map((t) => (
                      <button key={t} type="button" className={fgTool === t ? 'is-on' : ''} onClick={() => setFgTool(t)}>
                        {t === 'wand' ? 'Wand' : t === 'brush' ? 'Brush' : 'Eraser'}
                      </button>
                    ))}
                    {fgTool === 'wand' ? (
                      <label>
                        Tolerance
                        <input type="number" min={0} max={255} value={fgTol}
                          onChange={(e) => setFgTol(Math.max(0, Math.min(255, Number(e.target.value) || 0)))} style={{ width: 56 }} />
                      </label>
                    ) : (
                      <label>
                        Size
                        <input type="number" min={1} max={64} value={fgSize}
                          onChange={(e) => setFgSize(Math.max(1, Math.min(64, Number(e.target.value) || 1)))} style={{ width: 56 }} />
                      </label>
                    )}
                    <button type="button" onClick={onFgUndo} disabled={fgHistory.length === 0} title="Undo (⌘/Ctrl+Z)">
                      Undo
                    </button>
                  </div>
                  <canvas ref={fgViewRef} className="fg-canvas" onMouseDown={onFgDown} onMouseMove={onFgMove} onMouseUp={onFgUp} onMouseLeave={() => { onFgUp(); setFgCursor(null) }} />
                </div>
              )}
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
