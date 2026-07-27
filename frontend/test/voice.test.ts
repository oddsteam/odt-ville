import { describe, it, expect } from 'vitest'
import { podFor } from '../src/voice/service.ts'
import { VOICE_RADIUS, POD_CAP, type VoicePosition } from '../src/voice/schema.ts'
import type { RemotePlayer } from '../src/game/presence.ts'

const at = (x: number, y: number): VoicePosition => ({ x, y })

const rosterOf = (peers: Record<string, VoicePosition>) => new Map(Object.entries(peers))

describe('podFor', () => {
  const own = at(10, 10)

  it('is empty when nobody is around — the solo hometown never opens voice', () => {
    expect(podFor(own, new Map())).toEqual([])
  })

  it('includes a peer standing inside the voice radius', () => {
    const pod = podFor(own, rosterOf({ alice: at(10 + VOICE_RADIUS * 0.5, 10) }))
    expect(pod.map((p) => p.userId)).toEqual(['alice'])
  })

  it('excludes a peer beyond the voice radius', () => {
    const pod = podFor(own, rosterOf({ bob: at(10 + VOICE_RADIUS + 1, 10) }))
    expect(pod).toEqual([])
  })

  it('measures distance diagonally, not per-axis', () => {
    // Both axes are inside the radius, but the true distance is not.
    const corner = Math.ceil(VOICE_RADIUS * 0.8)
    const pod = podFor(own, rosterOf({ far: at(10 + corner, 10 + corner) }))
    expect(pod).toEqual([])
  })

  it('scales gain with distance — the closer peer is louder', () => {
    const pod = podFor(
      own,
      rosterOf({ near: at(10 + VOICE_RADIUS * 0.25, 10), far: at(10 + VOICE_RADIUS * 0.75, 10) }),
    )
    const gain = Object.fromEntries(pod.map((p) => [p.userId, p.gain]))
    expect(gain.near).toBeGreaterThan(gain.far)
    expect(gain.far).toBeGreaterThan(0)
    expect(gain.near).toBeLessThanOrEqual(1)
  })

  it('gives a peer sharing our tile full gain', () => {
    expect(podFor(own, rosterOf({ onTop: at(10, 10) }))[0].gain).toBe(1)
  })

  it('caps the pod and keeps the nearest peers', () => {
    const crowd: Record<string, VoicePosition> = {}
    // Ten peers strung out along one axis inside the radius, furthest first.
    for (let i = 10; i >= 1; i--) crowd[`peer${i}`] = at(10 + i * (VOICE_RADIUS / 12), 10)

    const pod = podFor(own, rosterOf(crowd))

    expect(pod).toHaveLength(POD_CAP)
    expect(pod.map((p) => p.userId)).toEqual(
      ['peer1', 'peer2', 'peer3', 'peer4', 'peer5', 'peer6'].slice(0, POD_CAP),
    )
  })

  it('caps at six or fewer to keep the mesh cheap', () => {
    expect(POD_CAP).toBeLessThanOrEqual(6)
  })

  // The decoupling this module's boundary rests on: voice never imports the
  // game, but MapScene must still be able to hand its roster straight over.
  // If VoicePosition ever grows a field RemotePlayer lacks, this stops compiling.
  it("accepts MapScene's RemotePlayer roster unchanged", () => {
    const remote: RemotePlayer = {
      name: 'alice',
      x: 11,
      y: 10,
      facing: 'down',
      manifestId: null,
      card: null,
    }
    const roster: Map<string, VoicePosition> = new Map([['alice', remote]])

    expect(podFor(own, roster).map((p) => p.userId)).toEqual(['alice'])
  })
})
