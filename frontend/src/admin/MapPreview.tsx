import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { preloadBakedMap, renderBakedMap } from '../game/phaser/mapRenderer.ts'
import { TILE } from '../game/constants.js'
import { tileFromPointer } from './previewPointer.ts'
import type { BakedMap } from '../maps/schema.ts'

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
  onTileClick,
}: {
  baked: BakedMap
  // The fetched tile objects the map's entities reference (ADR-0008), for the
  // shared loader to register as obj.<id> textures. Absent on prop-less maps.
  objects?: readonly { id: number; image: string; footprint_w: number; footprint_h: number }[]
  // When set (props mode, #143), the preview *is* the placement surface: a
  // click resolves to the tile under the cursor and calls back with it. The
  // callback owns place/erase; out-of-map clicks are dropped here.
  onTileClick?: (x: number, y: number) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  // The live Phaser canvas — measured on click to map cursor px → tile,
  // folding in the column's scroll and any CSS scale (see previewPointer).
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

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
      scene: [PreviewScene],
    })
    game.registry.set('bakedMap', baked)
    game.registry.set('bakedObjects', objects ?? [])
    canvasRef.current = game.canvas
    return () => {
      canvasRef.current = null
      game.destroy(true)
    }
  }, [baked, objects])

  const handleDown = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!onTileClick || !canvas) return
    const { x, y } = tileFromPointer(e, canvas.getBoundingClientRect(), canvas, TILE)
    if (x >= 0 && x < baked.cols && y >= 0 && y < baked.rows) onTileClick(x, y)
  }

  // Size to the baked canvas (cols×rows × TILE); scroll rather than clip when a
  // large map exceeds the column width. (Not the tiny .admin-preview thumbnail.)
  return (
    <div
      ref={hostRef}
      onMouseDown={onTileClick ? handleDown : undefined}
      style={{
        display: 'inline-block',
        lineHeight: 0,
        maxWidth: '100%',
        overflow: 'auto',
        cursor: onTileClick ? 'crosshair' : undefined,
        border: '1px solid #34343f',
        borderRadius: 6,
        background: '#0e0e14',
      }}
    />
  )
}
