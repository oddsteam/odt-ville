import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { preloadBakedMap, renderBakedMap } from '../kernel/mapRenderer.ts'
import { TILE } from '../kernel/constants.ts'
import { tileFromPointer } from './previewPointer.ts'
import { blockedCells, type Mask } from './maskPaint.ts'
import type { BakedMap } from '../kernel/schema.ts'

// The editor's WYSIWYG bake preview (#107). It renders the *real* baked map
// through the shared draw path (preloadBakedMap/renderBakedMap) — the same
// code the runtime MapScene uses — so what the author sees is exactly what
// /maps/<slug> will show. The editor owns this scene rather than importing the
// runtime MapScene, keeping the ADR-0004 boundary (editor ↛ Game Runtime).
class PreviewScene extends Phaser.Scene {
  constructor() {
    super('Preview')
  }
  preload() {
    preloadBakedMap(this)
  }
  create() {
    renderBakedMap(this)
  }
}

export default function MapPreview({
  baked,
  objects,
  onTileDown,
  onTileDrag,
  onTileHover,
  onTileHoverEnd,
  overlay,
  ghost,
  fill,
}: {
  baked: BakedMap
  // The fetched tile objects the map's entities reference (ADR-0008), for the
  // shared loader to register as obj.<id> textures. Absent on prop-less maps. An
  // object's optional `fg_mask` (#168) rides along so the preview clips the same
  // walk-behind overlay the runtime does — WYSIWYG foreground occlusion.
  objects?: readonly {
    id: number
    image: string
    footprint_w: number
    footprint_h: number
    fg_mask?: string | null
  }[]
  // When set the preview *is* the editing surface (#143/#145): a press resolves
  // to the tile under the cursor and calls back. `onTileDown` fires on mousedown
  // (place a prop, start a collision stroke); `onTileDrag` fires as the cursor
  // crosses tiles with the button held (paint the collision mask). The callbacks
  // own place/erase/paint; out-of-map cursors are dropped here.
  onTileDown?: (x: number, y: number) => void
  onTileDrag?: (x: number, y: number) => void
  // Hover reporting for the footprint ghost (#144): `onTileHover` fires as the
  // (button-up) cursor crosses in-bounds tiles; `onTileHoverEnd` when it leaves
  // the map. The caller turns the hovered tile into a `ghost` to draw back.
  onTileHover?: (x: number, y: number) => void
  onTileHoverEnd?: () => void
  // The collision mask to draw as a red overlay over the map art (#145); null
  // hides it. Semi-transparent so the terrain beneath stays visible.
  overlay?: Mask | null
  // The footprint ghost to preview under the cursor (#144): a tile rect the size
  // of the acted-on footprint. `image` (place mode) draws the object art semi-
  // transparent; `refused` tints it red (placement would hang off the edge);
  // no image (erase mode) draws a highlight box round the prop a click removes.
  ghost?: { x: number; y: number; w: number; h: number; image?: string; refused?: boolean } | null
  // Fill the host frame (the full-width decorate pane, #165) with a zoom toolbar
  // over a scrollable, pannable map — default zoom fits the whole map. Off by
  // default so the create-map preview keeps its natural, native-px size.
  fill?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  // The live Phaser canvas — measured on press to map cursor px → tile,
  // folding in the column's scroll and any CSS scale (see previewPointer).
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // A drag is in flight (button held after a mousedown on the canvas); guards
  // the mousemove → paint path. Cleared on any mouseup, even off the canvas.
  const dragging = useRef(false)
  // The last tile we reported during a drag — dedupes mousemove so a stroke
  // paints once per tile crossed, not once per pixel.
  const lastTile = useRef<{ x: number; y: number } | null>(null)
  // The scrollable frame (fill mode) and zoom. `fitScale` (largest that shows
  // the whole map) is the default; `userZoom` overrides it once the author
  // zooms. The wrapper is sized map×zoom so overflow:auto gives real scrollbars.
  const frameRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const [userZoom, setUserZoom] = useState<number | null>(null)
  const zoom = fill ? (userZoom ?? fitScale) : 1
  const bumpZoom = (f: number) => setUserZoom((z) => Math.min(8, Math.max(0.1, (z ?? fitScale) * f)))

  const mapW = baked.cols * TILE
  const mapH = baked.rows * TILE

  // Track the frame size so "Fit" (and the initial zoom) shows the whole map:
  // the largest scale where both dimensions fit.
  useEffect(() => {
    const frame = frameRef.current
    if (!fill || !frame) return undefined
    const measure = () => {
      const { width, height } = frame.getBoundingClientRect()
      setFitScale(Math.max(0.1, Math.min(width / mapW, height / mapH)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [fill, mapW, mapH])

  // ponytail: rebuild the game on every bake change. Fine for editor-sized
  // grids; if large maps lag mid-drag, keep one game and scene.restart() instead.
  useEffect(() => {
    if (!hostRef.current) return undefined
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: baked.cols * TILE,
      height: baked.rows * TILE,
      backgroundColor: '#5fc24a',
      pixelArt: true,
      antialias: false,
      // Phaser eats wheel events over the canvas by default (preventDefaultWheel);
      // let them through so a trackpad/wheel scrolls the surrounding frame (#165).
      input: { mouse: { preventDefaultWheel: false } },
      scene: [PreviewScene],
    })
    game.registry.set('bakedMap', baked)
    game.registry.set('bakedObjects', objects ?? [])
    // Let CSS size the canvas: it fills the (map×zoom) wrapper, so the native
    // bitmap scales — pixel-crisp — with the zoom instead of staying at native
    // px. previewPointer reads native width vs the rendered rect to map clicks.
    game.canvas.style.width = '100%'
    game.canvas.style.height = '100%'
    game.canvas.style.display = 'block'
    game.canvas.style.imageRendering = 'pixelated'
    canvasRef.current = game.canvas
    return () => {
      canvasRef.current = null
      game.destroy(true)
    }
  }, [baked, objects])

  // End the drag on any mouseup, even off the canvas, so a stroke that runs off
  // the edge doesn't keep painting on the next hover.
  useEffect(() => {
    const end = () => {
      dragging.current = false
      lastTile.current = null
    }
    window.addEventListener('mouseup', end)
    return () => window.removeEventListener('mouseup', end)
  }, [])

  // Resolve a pointer to its in-bounds tile, or null when it's off the map.
  const tileAt = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const { x, y } = tileFromPointer(e, canvas.getBoundingClientRect(), canvas, TILE)
    return x >= 0 && x < baked.cols && y >= 0 && y < baked.rows ? { x, y } : null
  }

  const handleDown = (e: { clientX: number; clientY: number }) => {
    const t = tileAt(e)
    if (!t) return
    dragging.current = true
    lastTile.current = t
    onTileDown?.(t.x, t.y)
  }

  const handleMove = (e: { clientX: number; clientY: number }) => {
    const t = tileAt(e)
    // Button held: extend the collision stroke, one report per tile crossed.
    if (dragging.current && onTileDrag) {
      if (t && !(lastTile.current && t.x === lastTile.current.x && t.y === lastTile.current.y)) {
        lastTile.current = t
        onTileDrag(t.x, t.y)
      }
      return
    }
    // Button up: report the hovered tile for the ghost cursor (or its absence).
    if (onTileHover) t ? onTileHover(t.x, t.y) : onTileHoverEnd?.()
  }

  const interactive = !!(onTileDown || onTileDrag || onTileHover)

  // The map board: a wrapper sized map×zoom (native px when not filling), the
  // CSS-filled Phaser canvas, and the % overlay/ghost that track the art at any
  // zoom or scroll. pointer-events:none lets presses fall through to the canvas.
  const board = (
    <div
      onMouseDown={interactive ? handleDown : undefined}
      onMouseMove={interactive ? handleMove : undefined}
      onMouseLeave={onTileHoverEnd}
      style={{
        position: 'relative',
        width: mapW * zoom,
        height: mapH * zoom,
        lineHeight: 0,
        cursor: interactive ? 'crosshair' : undefined,
      }}
    >
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
      {overlay && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {blockedCells(overlay).map(({ x, y }) => (
            <div
              key={`${x},${y}`}
              style={{
                position: 'absolute',
                left: `${(x / baked.cols) * 100}%`,
                top: `${(y / baked.rows) * 100}%`,
                width: `${(1 / baked.cols) * 100}%`,
                height: `${(1 / baked.rows) * 100}%`,
                background: '#dd3333',
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      )}
      {ghost && (
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            left: `${(ghost.x / baked.cols) * 100}%`,
            top: `${(ghost.y / baked.rows) * 100}%`,
            width: `${(ghost.w / baked.cols) * 100}%`,
            height: `${(ghost.h / baked.rows) * 100}%`,
            opacity: 0.55,
            // Erase highlight (no image) fills white; a refused placement tints
            // red behind the semi-transparent art so it reads as "won't stamp".
            background: ghost.refused ? '#dd3333' : ghost.image ? undefined : '#ffffff',
            outline: `2px solid ${ghost.refused ? '#dd3333' : '#ffffff'}`,
          }}
        >
          {ghost.image && (
            <img
              src={ghost.image}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'fill', imageRendering: 'pixelated' }}
            />
          )}
        </div>
      )}
    </div>
  )

  const frameStyle = { border: '1px solid #34343f', borderRadius: 6, background: '#0e0e14' } as const

  // Standalone (create-map) preview: natural size, scroll when it overflows.
  if (!fill)
    return (
      <div ref={frameRef} style={{ ...frameStyle, display: 'inline-block', maxWidth: '100%', overflow: 'auto' }}>
        {board}
      </div>
    )

  // Fill mode (#165): a zoom toolbar over a scrollable frame — the author zooms
  // in and pans the map with the frame's own scrollbars/trackpad.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', height: '100%' }}>
      <div className="admin-field-inline">
        <button onClick={() => bumpZoom(0.8)} title="Zoom out">−</button>
        <span className="admin-hint" style={{ minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => bumpZoom(1.25)} title="Zoom in">+</button>
        <button onClick={() => setUserZoom(null)} title="Fit to view">Fit</button>
      </div>
      <div ref={frameRef} style={{ ...frameStyle, flex: 1, minHeight: 0, overflow: 'auto' }}>
        {board}
      </div>
    </div>
  )
}
