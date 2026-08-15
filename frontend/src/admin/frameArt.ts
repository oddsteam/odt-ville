// How a non-Phaser surface paints a tile object's art (#437). Since #435 an
// object's `image` can be a horizontal frame strip, so a plain <img> smears the
// whole strip across its box — the 72-frame spell book is 2304px wide in a 32px
// palette slot. Painting the strip as a *background* sized `frame_count × 100%`
// shows frame 0 at the frame's own size, and a steps() keyframe (in admin.css)
// walks the rest for free. No baked thumbnail: a copy of the art drifts from the
// art (ADR-0008).
//
// `fit` is the box the caller owns: 'contain' letterboxes in a fixed slot (the
// palette), 'stretch' fills a footprint-shaped rect (the placement ghost).
// A still object (frame_count ≤ 1) paints its whole image, as it always did.

import type { CSSProperties } from 'react'
import { DEFAULT_FPS } from '../kernel/entityLoader.ts'

export type FrameArt = {
  image: string
  frame_count?: number | null
  fps?: number | null
  footprint_w?: number
  footprint_h?: number
}

// The palette slot, in px — the box a still thumbnail already fills.
const SLOT = 32

export function frameArtStyle(o: FrameArt, fit: 'contain' | 'stretch'): CSSProperties {
  const frames = o.frame_count ?? 1
  const style: CSSProperties = {
    backgroundImage: `url("${o.image}")`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  }
  if (frames < 2)
    return { ...style, backgroundSize: fit === 'contain' ? 'contain' : '100% 100%', backgroundPosition: 'center' }
  // One frame has to span the box exactly or the steps() walk lands between
  // frames — so a strip letterboxes by shrinking its *box* to the frame's shape
  // rather than by leaving background slack. A frame is its footprint's shape
  // (the spell book's 1×2 is 32×64px), square when no footprint rides along.
  const aspect = (o.footprint_w ?? 1) / (o.footprint_h ?? 1)
  const box: CSSProperties =
    fit === 'contain'
      ? { width: `${SLOT * Math.min(1, aspect)}px`, height: `${SLOT * Math.min(1, 1 / aspect)}px` }
      : {}
  return {
    ...style,
    ...box,
    backgroundSize: `${frames * 100}% 100%`,
    backgroundPosition: '0 0',
    // Frame k sits at background-position-x k/(frames-1) × 100% (percentages
    // position against image-minus-box), so 0%→100% split by
    // `steps(frames, jump-none)` — which includes both ends — lands on each
    // frame exactly once per loop.
    animation: `frame-strip ${frames / (o.fps ?? DEFAULT_FPS)}s steps(${frames}, jump-none) infinite`,
  }
}
