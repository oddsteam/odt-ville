// Windowed tileset drawing for the admin mappers (#352). A sheet like
// 5_Floor_Modular_Buildings_32x32 (1024×8288) sized straight onto a canvas at
// 3× is ~76 megapixels — Chrome tolerates it, Safari's canvas area limit does
// not. Instead the canvas covers only its container and the wrapper scrolls a
// full-size spacer; these two turn the scroll offset into what to draw and what
// was clicked.

import { useEffect, useState } from 'react'

export type View = { x: number; y: number; w: number; h: number }

// The scroll offset + inner size of the scrolling wrapper, kept in state so the
// draw effect reruns on scroll and resize. Same object identity while nothing
// moved, so a ResizeObserver tick can't loop.
export function useScrollView(ref: React.RefObject<HTMLElement | null>): View {
  const [view, setView] = useState<View>({ x: 0, y: 0, w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () =>
      setView((v) =>
        v.x === el.scrollLeft && v.y === el.scrollTop && v.w === el.clientWidth && v.h === el.clientHeight
          ? v
          : { x: el.scrollLeft, y: el.scrollTop, w: el.clientWidth, h: el.clientHeight },
      )
    el.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [ref])
  return view
}

// The slice of the sheet, in source pixels, that the scrolled window shows.
// Floored to whole source pixels (a fractional source offset makes a
// nearest-neighbour draw wobble) and +1 cell of slack for the partial pixel at
// each far edge, then clamped to the sheet.
export function visibleSlice(
  view: View, zoom: number, sheetW: number, sheetH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = Math.floor(view.x / zoom)
  const sy = Math.floor(view.y / zoom)
  return {
    sx,
    sy,
    sw: Math.min(Math.ceil(view.w / zoom) + 1, sheetW - sx),
    sh: Math.min(Math.ceil(view.h / zoom) + 1, sheetH - sy),
  }
}

// A click on the windowed canvas → the cell under the cursor. Takes the offset
// within the canvas plus the wrapper's scroll, so the offset has to be added
// back or every click lands on the wrong tile.
export function cellAtPoint(
  offsetX: number, offsetY: number, scroll: { x: number; y: number },
  step: number, cols: number, rows: number,
): { c: number; r: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v)))
  return { c: clamp((offsetX + scroll.x) / step, cols), r: clamp((offsetY + scroll.y) / step, rows) }
}
