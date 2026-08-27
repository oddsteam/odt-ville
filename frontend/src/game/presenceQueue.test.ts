import { describe, it, expect } from 'vitest'
import { PeerStepQueue, MAX_BACKLOG, type Step } from './presenceQueue.ts'

const step = (x: number, y: number): Step => ({ x, y, facing: 'down' })

describe('PeerStepQueue', () => {
  it('plays a single step from idle, then drains to idle', () => {
    const q = new PeerStepQueue()
    expect(q.push(step(1, 0)).snap).toBe(false)
    // push does not start playback — the scene checks `playing` and pulls next().
    expect(q.playing).toBe(false)
    expect(q.next()).toEqual(step(1, 0))
    expect(q.playing).toBe(true)
    // Drained: nothing left, back to idle so the onComplete chain stops.
    expect(q.next()).toBeNull()
    expect(q.playing).toBe(false)
  })

  it('queues a frame that arrives while playing, plays it in order', () => {
    const q = new PeerStepQueue()
    q.push(step(1, 0))
    q.next() // playing step 1
    expect(q.playing).toBe(true)
    // A second frame lands mid-slide: it must not kill the current step.
    expect(q.push(step(2, 0)).snap).toBe(false)
    expect(q.backlog).toBe(1)
    expect(q.next()).toEqual(step(2, 0))
  })

  it('catches up a burst as sequential steps, in order', () => {
    const q = new PeerStepQueue()
    // Three frames arrive together (backlog reaches MAX_BACKLOG, no snap).
    q.push(step(1, 0))
    q.push(step(2, 0))
    q.push(step(3, 0))
    expect(q.backlog).toBe(MAX_BACKLOG)
    expect(q.next()).toEqual(step(1, 0))
    expect(q.next()).toEqual(step(2, 0))
    expect(q.next()).toEqual(step(3, 0))
    expect(q.next()).toBeNull()
  })

  it('snaps to the newest tile once the backlog exceeds MAX_BACKLOG', () => {
    const q = new PeerStepQueue()
    q.push(step(1, 0))
    q.push(step(2, 0))
    q.push(step(3, 0))
    const r = q.push(step(4, 0)) // one past the threshold
    expect(r.snap).toBe(true)
    expect(r.step).toEqual(step(4, 0))
    // Trail dropped, nothing left to slide.
    expect(q.backlog).toBe(0)
    expect(q.playing).toBe(false)
    expect(q.next()).toBeNull()
  })

  it('clears a mid-queue peer that leaves', () => {
    const q = new PeerStepQueue()
    q.push(step(1, 0))
    q.next()
    q.push(step(2, 0))
    q.clear()
    expect(q.backlog).toBe(0)
    expect(q.playing).toBe(false)
    expect(q.next()).toBeNull()
  })
})
