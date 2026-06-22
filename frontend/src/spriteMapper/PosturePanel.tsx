import { useEffect, useRef } from 'react'
import { POSTURE_SLOTS } from '../character/manifest.js'
import { useImage } from './useImage.js'

type FrameRect = { x: number; y: number; w: number; h: number }
type Postures = Record<string, FrameRect[]>
type Sheet = { src?: string }

// A single frame thumbnail, drawn cropped from the sheet.
function Thumb({ img, rect, size = 44 }: { img: HTMLImageElement | null; rect: FrameRect; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || !img) return
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    cv.width = size
    cv.height = size
    ctx.clearRect(0, 0, size, size)
    const s = Math.min(size / rect.w, size / rect.h)
    const w = rect.w * s
    const h = rect.h * s
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, (size - w) / 2, (size - h) / 2, w, h)
  }, [img, rect, size])
  return <canvas ref={ref} className="thumb" />
}

type Props = {
  sheet: Sheet | null
  postures: Postures
  activeSlot: string
  onSelectSlot: (key: string) => void
  onRemoveFrame: (slot: string, i: number) => void
  onClearSlot: (slot: string) => void
}

// Lists the eight posture slots (frame counts), lets the user pick the active
// slot, and shows the active slot's ordered frames with per-frame removal.
export default function PosturePanel({
  sheet,
  postures,
  activeSlot,
  onSelectSlot,
  onRemoveFrame,
  onClearSlot,
}: Props) {
  const img = useImage(sheet?.src)
  const activeLabel = POSTURE_SLOTS.find((s) => s.key === activeSlot)?.label
  const activeFrames = postures[activeSlot] || []

  return (
    <div className="posture-panel">
      <h3>Postures</h3>
      <p className="hint">
        Down &amp; Up are required. Leave Left/Right empty to reuse Down (flipped).
      </p>
      <ul className="slot-list">
        {POSTURE_SLOTS.map((s) => {
          const count = (postures[s.key] || []).length
          return (
            <li
              key={s.key}
              className={`slot ${s.key === activeSlot ? 'active' : ''} ${count ? 'filled' : ''}`}
              onClick={() => onSelectSlot(s.key)}
            >
              <span className="slot-label">{s.label}</span>
              <span className="slot-count">{count}</span>
            </li>
          )
        })}
      </ul>

      <div className="active-frames">
        <div className="active-head">
          <strong>{activeLabel}</strong>
          {activeFrames.length > 0 && (
            <button type="button" onClick={() => onClearSlot(activeSlot)}>
              Clear
            </button>
          )}
        </div>
        <div className="thumbs">
          {activeFrames.map((r: FrameRect, i: number) => (
            <div key={`${r.x},${r.y},${i}`} className="thumb-wrap" title={`frame ${i + 1}`}>
              <Thumb img={img} rect={r} />
              <span className="thumb-idx">{i + 1}</span>
              <button
                type="button"
                className="thumb-x"
                onClick={() => onRemoveFrame(activeSlot, i)}
                aria-label="remove frame"
              >
                ×
              </button>
            </div>
          ))}
          {activeFrames.length === 0 && (
            <span className="hint">Click frames on the sheet to add them in order.</span>
          )}
        </div>
      </div>
    </div>
  )
}
