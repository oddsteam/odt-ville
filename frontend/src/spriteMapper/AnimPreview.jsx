import { useEffect, useRef } from 'react'
import { useImage } from './useImage.js'

// Plays the given frame rects as a looping animation at frameRate, drawn
// pixel-scaled. One frame → static; zero → blank. Used to preview the active
// posture live as the user assigns frames.
export default function AnimPreview({ sheet, frames, frameRate, scale = 3, flipX = false }) {
  const ref = useRef(null)
  const img = useImage(sheet?.src)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return undefined
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingEnabled = false

    if (!img || !frames.length) {
      cv.width = 64
      cv.height = 96
      ctx.clearRect(0, 0, cv.width, cv.height)
      return undefined
    }

    const maxW = Math.max(...frames.map((f) => f.w))
    const maxH = Math.max(...frames.map((f) => f.h))
    cv.width = maxW * scale
    cv.height = maxH * scale

    const interval = 1000 / Math.max(1, frameRate)
    let i = 0
    let last = 0
    let raf = 0

    const draw = (t) => {
      if (t - last >= interval) {
        last = t
        i = (i + 1) % frames.length
      }
      const f = frames[i]
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.save()
      if (flipX) {
        ctx.translate(cv.width, 0)
        ctx.scale(-1, 1)
      }
      // Bottom-align frames of differing heights so feet stay put.
      const dx = ((maxW - f.w) / 2) * scale
      const dy = (maxH - f.h) * scale
      ctx.drawImage(img, f.x, f.y, f.w, f.h, dx, dy, f.w * scale, f.h * scale)
      ctx.restore()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [img, sheet, frames, frameRate, scale, flipX])

  return <canvas ref={ref} className="anim-canvas" />
}
