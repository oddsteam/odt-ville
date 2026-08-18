// The LiveKit SFU voice path (#309, ADR-0011), unit-tested against a fake Room
// (jsdom has no livekit-client / no real SFU). Covers: the flag gate, joining a
// room + publishing the mic, remote audio attach at constant volume, mute
// mapping to setMicrophoneEnabled, and stop disconnecting.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLivekitVoice, voiceSfuEnabled, type RoomLike } from './livekit.ts'
import type { MeetingRect } from './room.ts'
import { DWELL_MS, LEAVE_RADIUS, PREJOIN_RADIUS, type MicStatus, type VoicePosition } from './schema.ts'

class FakeTrack {
  constructor(public kind = 'audio') {}
}

class FakeRoom implements RoomLike {
  handlers = new Map<string, (...a: unknown[]) => void>()
  connected = false
  micEnabled: boolean | null = null
  disconnected = false
  localParticipant = {
    setMicrophoneEnabled: async (enabled: boolean) => {
      this.micEnabled = enabled
    },
  }
  on(event: string, cb: (...a: unknown[]) => void) {
    this.handlers.set(event, cb)
    return this
  }
  async connect() {
    this.connected = true
  }
  disconnect() {
    this.disconnected = true
  }
  emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args)
  }
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

function harness(meetingRects: MeetingRect[] = []) {
  const room = new FakeRoom()
  const attached: FakeTrack[] = []
  const detached: FakeTrack[] = []
  const statuses: MicStatus[] = []
  const latencies: number[] = []
  const tokensFor: string[] = [] // the room keys getToken was asked for, in order
  const mesh = createLivekitVoice({
    room,
    url: 'wss://example.livekit.cloud',
    proximityRoom: 'map-town',
    meetingRects,
    getToken: async (roomKey) => {
      tokensFor.push(roomKey)
      return 'jwt'
    },
    attach: (t) => attached.push(t as FakeTrack),
    detach: (t) => detached.push(t as FakeTrack),
    onStatus: (s) => statuses.push(s),
    onJoinLatency: (ms) => latencies.push(ms),
  })
  return { room, mesh, attached, detached, statuses, latencies, tokensFor }
}

const at = (x: number): VoicePosition => ({ x, y: 0 })
// A one-peer roster placed `d` tiles from the origin (where we stand).
const roster = (d: number) => new Map([['peer', at(d)]])

describe('voiceSfuEnabled flag (#309)', () => {
  it('is off unless the flag is an explicit truthy string', () => {
    expect(voiceSfuEnabled({})).toBe(false)
    expect(voiceSfuEnabled({ VITE_VOICE_SFU: 'false' })).toBe(false)
    expect(voiceSfuEnabled({ VITE_VOICE_SFU: '0' })).toBe(false)
    expect(voiceSfuEnabled({ VITE_VOICE_SFU: '1' })).toBe(true)
    expect(voiceSfuEnabled({ VITE_VOICE_SFU: 'true' })).toBe(true)
  })
})

describe('createLivekitVoice (#309)', () => {
  it('joins the room and publishes the mic once a peer is near', async () => {
    const { room, mesh } = harness()
    mesh.update(at(0), roster(1))
    await flush()
    expect(room.connected).toBe(true)
    expect(room.micEnabled).toBe(true)
  })

  it('attaches subscribed remote audio, ignoring video', async () => {
    const { room, attached } = harness()
    await flush()
    const audio = new FakeTrack('audio')
    room.emit('trackSubscribed', audio)
    room.emit('trackSubscribed', new FakeTrack('video'))
    expect(attached).toEqual([audio])
  })

  it('detaches a track when it unsubscribes', async () => {
    const { room, detached } = harness()
    const t = new FakeTrack('audio')
    room.emit('trackSubscribed', t)
    room.emit('trackUnsubscribed', t)
    expect(detached).toEqual([t])
  })

  it('maps mute to the microphone, reporting the standing choice', async () => {
    const { room, mesh, statuses } = harness()
    mesh.update(at(0), roster(1))
    await flush()
    expect(statuses.at(-1)).toEqual({ live: true, muted: false, denied: false })

    mesh.setMute(true)
    await flush()
    expect(room.micEnabled).toBe(false)
    expect(statuses.at(-1)).toEqual({ live: false, muted: true, denied: false })
  })

  it('stop disconnects the room', async () => {
    const { room, mesh } = harness()
    mesh.update(at(0), roster(1))
    await flush()
    mesh.stop()
    expect(room.disconnected).toBe(true)
  })
})

describe('proximity-gated membership (#310)', () => {
  it('does not join on map entry — only when a peer is within the pre-join band', async () => {
    const { room, mesh } = harness()
    await flush()
    expect(room.connected).toBe(false) // constructed, not connected

    mesh.update(at(0), roster(PREJOIN_RADIUS)) // exactly at the band edge: still outside (<)
    await flush()
    expect(room.connected).toBe(false)

    mesh.update(at(0), roster(PREJOIN_RADIUS - 0.5)) // now inside the pre-join band
    await flush()
    expect(room.connected).toBe(true)
  })

  it('measures the room join latency (a reusable spike output)', async () => {
    const { mesh, latencies } = harness()
    mesh.update(at(0), roster(1))
    await flush()
    expect(latencies).toHaveLength(1)
    expect(latencies[0]).toBeGreaterThanOrEqual(0)
  })

  it('joins only once while a peer stays in range', async () => {
    const { room, mesh } = harness()
    let connects = 0
    const realConnect = room.connect.bind(room)
    room.connect = async (...a: unknown[]) => {
      connects++
      return realConnect(...(a as []))
    }
    mesh.update(at(0), roster(1))
    await flush()
    mesh.update(at(0), roster(1)) // still there — must not re-join
    await flush()
    expect(connects).toBe(1)
  })
})

describe('leave dwell timer (#310)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const joined = async (h: ReturnType<typeof harness>) => {
    h.mesh.update(at(0), roster(1))
    await flush()
    expect(h.room.connected).toBe(true)
  }

  it('stays connected in the dead-band beyond pre-join (no thrash)', async () => {
    const h = harness()
    await joined(h)
    // Between PRE-JOIN and LEAVE: not re-joining, but not leaving either.
    h.mesh.update(at(0), roster((PREJOIN_RADIUS + LEAVE_RADIUS) / 2))
    await flush()
    vi.advanceTimersByTime(DWELL_MS * 2)
    await flush()
    expect(h.room.disconnected).toBe(false)
  })

  it('leaves after the dwell timer once the pod empties', async () => {
    const h = harness()
    await joined(h)
    h.mesh.update(at(0), new Map()) // pod empties
    await flush()

    vi.advanceTimersByTime(DWELL_MS - 1)
    await flush()
    expect(h.room.disconnected).toBe(false) // still holding through the dwell

    vi.advanceTimersByTime(1)
    await flush()
    expect(h.room.disconnected).toBe(true) // dwell elapsed — now gone
  })

  it('a peer returning within the dwell cancels the leave', async () => {
    const h = harness()
    await joined(h)
    h.mesh.update(at(0), new Map()) // pod empties, dwell starts
    await flush()
    vi.advanceTimersByTime(DWELL_MS - 1)

    h.mesh.update(at(0), roster(1)) // back in range before the dwell fires
    await flush()
    vi.advanceTimersByTime(DWELL_MS)
    await flush()
    expect(h.room.disconnected).toBe(false) // never left, so no reconnect / no fresh minute
  })
})

describe('meeting rooms (#486)', () => {
  // A 3×3 room anchored at (5,5); (6,6) is inside, (0,0) is outside.
  const RECTS: MeetingRect[] = [{ x: 5, y: 5, w: 3, h: 3, roomId: 'standup' }]

  it('joins the meeting room on entry, alone, regardless of proximity', async () => {
    const h = harness(RECTS)
    h.mesh.update({ x: 6, y: 6 }, new Map()) // inside the rect, nobody near
    await flush()
    expect(h.room.connected).toBe(true)
    expect(h.tokensFor).toEqual(['meeting-standup']) // not the proximity room
  })

  it('drops the proximity room when walking into a meeting room', async () => {
    const h = harness(RECTS)
    h.mesh.update({ x: 0, y: 0 }, roster(1)) // outside, a peer near → proximity join
    await flush()
    expect(h.tokensFor).toEqual(['map-town'])

    h.mesh.update({ x: 6, y: 6 }, roster(1)) // step into the rect
    await flush()
    expect(h.room.disconnected).toBe(true) // left the proximity room...
    expect(h.tokensFor).toEqual(['map-town', 'meeting-standup']) // ...for the meeting room
  })

  it('stays connected while standing still inside the room (joins once)', async () => {
    const h = harness(RECTS)
    let connects = 0
    const realConnect = h.room.connect.bind(h.room)
    h.room.connect = async (...a: unknown[]) => {
      connects++
      return realConnect(...(a as []))
    }
    h.mesh.update({ x: 6, y: 6 }, new Map())
    await flush()
    h.mesh.update({ x: 6, y: 6 }, new Map()) // still inside — must not re-join
    await flush()
    expect(connects).toBe(1)
  })

  describe('with fake timers', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const entered = async (h: ReturnType<typeof harness>) => {
      h.mesh.update({ x: 6, y: 6 }, new Map())
      await flush()
      expect(h.room.connected).toBe(true)
    }

    it('leaves the meeting room only after the dwell once you walk out', async () => {
      const h = harness(RECTS)
      await entered(h)
      h.mesh.update({ x: 0, y: 0 }, new Map()) // walked out, nobody near

      vi.advanceTimersByTime(DWELL_MS - 1)
      await flush()
      expect(h.room.disconnected).toBe(false) // still connected through the dwell

      vi.advanceTimersByTime(1)
      await flush()
      expect(h.room.disconnected).toBe(true)
    })

    it('re-entering within the dwell cancels the leave, with no reconnect', async () => {
      const h = harness(RECTS)
      await entered(h)
      h.mesh.update({ x: 0, y: 0 }, new Map()) // walked out, dwell starts
      await flush()
      vi.advanceTimersByTime(DWELL_MS - 1)

      h.mesh.update({ x: 6, y: 6 }, new Map()) // back inside before the dwell fires
      await flush()
      vi.advanceTimersByTime(DWELL_MS)
      await flush()
      expect(h.room.disconnected).toBe(false) // never left → no fresh billed minute
      expect(h.tokensFor).toEqual(['meeting-standup']) // one join only
    })

    it('falls back to the proximity room after the dwell when a peer is near', async () => {
      const h = harness(RECTS)
      await entered(h)
      h.mesh.update({ x: 0, y: 0 }, roster(1)) // walked out; a peer is in earshot
      await flush()
      vi.advanceTimersByTime(DWELL_MS)
      await flush()
      expect(h.tokensFor).toEqual(['meeting-standup', 'map-town']) // meeting → proximity
    })
  })
})
