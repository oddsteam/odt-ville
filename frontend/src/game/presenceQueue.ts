// Jitter buffer for remote-player movement (#542). Presence frames ride
// ActionCable through the Cloudflare tunnel and arrive in bursts; rendering one
// MOVE_MS slide per frame and killing the previous makes a peer "sprint" —
// several steps replayed at high speed. This is the pure per-peer step queue
// MapScene plays back one tile at a time. No Phaser, no network — the scene
// owns the tweening; this only decides order, catch-up and the snap threshold.

import type { Direction } from './phaser/movement.ts'

// One queued tile-step. Facing is per-step so the walk animation plays the
// direction that step actually moved, not just the peer's latest facing.
export interface Step {
  x: number
  y: number
  facing: Direction
}

// Drop-and-snap once more than this many tiles are waiting: a clean teleport to
// the newest tile beats replaying a long trail at high speed.
export const MAX_BACKLOG = 3

export class PeerStepQueue {
  private pending: Step[] = []
  // True while a slide is in flight (a step has been handed to the scene and
  // not yet drained). The scene reads this to decide whether a fresh frame
  // kicks off playback or just rides the existing onComplete chain.
  playing = false

  get backlog(): number {
    return this.pending.length
  }

  // Fold in a freshly-arrived move. If the backlog now exceeds MAX_BACKLOG,
  // discard the whole trail and keep only this newest step — returns
  // `{ snap: true }` and the scene teleports to `step`. Otherwise the step joins
  // the queue and returns `{ snap: false }`.
  push(step: Step): { snap: boolean; step: Step } {
    this.pending.push(step)
    if (this.pending.length > MAX_BACKLOG) {
      this.pending = []
      this.playing = false
      return { snap: true, step }
    }
    return { snap: false, step }
  }

  // Pop the next step to slide to, or null when drained. Sets `playing` to
  // whether a step is now in flight, so the scene's onComplete chain settles to
  // idle on the last tile instead of looping forever.
  next(): Step | null {
    const step = this.pending.shift() ?? null
    this.playing = step != null
    return step
  }

  // Forget every queued step — a peer that left, was pruned out of range, or was
  // snapped/caught up to newest has no trail left to play.
  clear(): void {
    this.pending = []
    this.playing = false
  }
}
