import { useEffect, useRef } from 'react'
import { useImage } from './useImage.js'

type FrameRect = { x: number; y: number; w: number; h: number }
type Sheet = { src: string; width: number; height: number }
type Props = {
  sheet: Sheet | null
  grid: { frameW: number; frameH: number }
  zoom: number
  frames: FrameRect[]
  onToggleFrame: (rect: FrameRect) => void
}

// Renders the source sheet on a canvas with a frame grid overlay. Clicking a
// grid cell toggles that frame in the active posture. Frames already in the
// active posture are highlighted with their 1-based order number.
export default function SheetCanvas({ sheet, grid, zoom, frames, onToggleFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const img = useImage(sheet?.src)
  const fw = grid.frameW
  const fh = grid.frameH

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !img || !sheet) return
    const W = sheet.width * zoom
    const H = sheet.height * zoom
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(img, 0, 0, W, H)

    // Grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 1
    for (let x = 0; x <= sheet.width; x += fw) {
      ctx.beginPath()
      ctx.moveTo(x * zoom + 0.5, 0)
      ctx.lineTo(x * zoom + 0.5, H)
      ctx.stroke()
    }
    for (let y = 0; y <= sheet.height; y += fh) {
      ctx.beginPath()
      ctx.moveTo(0, y * zoom + 0.5)
      ctx.lineTo(W, y * zoom + 0.5)
      ctx.stroke()
    }

    // Active-posture frames, in order.
    frames.forEach((r: FrameRect, i: number) => {
      ctx.fillStyle = 'rgba(46,125,255,0.32)'
      ctx.fillRect(r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom)
      ctx.strokeStyle = '#2e7dff'
      ctx.lineWidth = 2
      ctx.strokeRect(r.x * zoom + 1, r.y * zoom + 1, r.w * zoom - 2, r.h * zoom - 2)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px monospace'
      ctx.fillText(String(i + 1), r.x * zoom + 3, r.y * zoom + 13)
    })
  }, [img, sheet, zoom, fw, fh, frames])

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!img) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const px = (e.clientX - rect.left) / zoom
    const py = (e.clientY - rect.top) / zoom
    const col = Math.floor(px / fw)
    const row = Math.floor(py / fh)
    onToggleFrame({ x: col * fw, y: row * fh, w: fw, h: fh })
  }

  if (!sheet) {
    return <div className="sheet-empty">Pick a bundled sheet or upload a PNG to begin.</div>
  }
  return (
    <div className="sheet-scroll">
      <canvas ref={canvasRef} onClick={handleClick} className="sheet-canvas" />
    </div>
  )
}
