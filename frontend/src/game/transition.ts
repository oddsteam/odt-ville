// The warp effect (#254): travelling through a Portal is a cut today — travel()
// loads the target Node then swaps route/scene in the same tick, reading as a
// glitch. This wraps the swap in a fade through black so leaving one Node and
// arriving in the next is legible, and the black hold covers the new Node's
// first render frames (heaviest on multiplayer maps). Only the success path
// swaps, so a gated/broken target (#84) never fades — the notice shows and the
// avatar stays put. Bounded by construction: two waits, never the load.

export interface FadeDeps {
  cover: (opacity: number) => void // 0 = clear, 1 = full black
  wait: (ms: number) => Promise<void>
  lock: (on: boolean) => void // true = ignore input for the duration
}

export const FADE_MS = 220

export async function fadeThrough(swap: () => void, deps: FadeDeps, ms = FADE_MS) {
  deps.lock(true)
  deps.cover(1)
  await deps.wait(ms)
  try {
    swap()
    // finally, not the happy path, so a swap that throws still lifts the black
    // and releases input instead of stranding the screen dark — the bounded
    // guarantee holds even when the swap fails.
  } finally {
    deps.cover(0)
    await deps.wait(ms)
    deps.lock(false)
  }
}

// The live seam: one full-screen black overlay on <body>, so it survives both
// MapPage's route teardown (a fresh Phaser game) and the village's scene swaps.
// A CSS opacity transition of FADE_MS turns each cover() into a real fade; the
// module-level `locked` flag is what MapScene.update() reads to drop input.
let overlay: HTMLDivElement | null = null
let locked = false

const el = () => {
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.style.cssText = `position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:9999;transition:opacity ${FADE_MS}ms linear`
    document.body.appendChild(overlay)
  }
  return overlay
}

export const isTransitioning = () => locked

export const warp = (swap: () => void) =>
  fadeThrough(swap, {
    cover: (o) => {
      el().style.opacity = String(o)
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    lock: (on) => {
      locked = on
    },
  })
