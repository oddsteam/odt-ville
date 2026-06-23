// Pure stall detector. The Phaser game loop feeds it the per-frame `delta`
// (ms since last update); the detector counts frames where delta exceeds a
// threshold and fires once after enough stalls accumulate.
//
// Why a pure module: scenes call observeFrame on every tick, which is the
// hottest path in the codebase. Keeping the detector free of Phaser, of
// timers, and of any side effect makes it allocation-cheap (one tiny object
// per non-stall frame is avoided by returning state-unchanged) and makes
// the behaviour testable without standing up a scene.
//
// The thresholds are tuned so that the routine RAF lulls in modern browsers
// (~16–32ms even under moderate load) don't count, while the multi-hundred-
// millisecond freezes that throttling extensions produce do — and require
// repetition before alerting, so a single tab-blur catch-up frame can't
// false-positive.
export const DEFAULT_STALL_THRESHOLD_MS = 500
export const DEFAULT_STALLS_TO_FIRE = 3

export interface PerfStallState {
  readonly count: number
  readonly fired: boolean
}

export interface PerfStallOptions {
  readonly thresholdMs?: number
  readonly stallsToFire?: number
}

export const initialPerfStallState = (): PerfStallState => ({ count: 0, fired: false })

export interface PerfStallObservation {
  readonly state: PerfStallState
  readonly fire: boolean
}

export function observeFrame(
  state: PerfStallState,
  deltaMs: number,
  options: PerfStallOptions = {},
): PerfStallObservation {
  if (state.fired) return { state, fire: false }
  const threshold = options.thresholdMs ?? DEFAULT_STALL_THRESHOLD_MS
  const limit = options.stallsToFire ?? DEFAULT_STALLS_TO_FIRE
  if (deltaMs <= threshold) return { state, fire: false }
  const count = state.count + 1
  if (count >= limit) {
    return { state: { count, fired: true }, fire: true }
  }
  return { state: { count, fired: false }, fire: false }
}
