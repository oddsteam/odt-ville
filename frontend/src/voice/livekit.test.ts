// The LiveKit SFU voice path (#309, ADR-0011), unit-tested against a fake Room
// (jsdom has no livekit-client / no real SFU). Covers: the flag gate, joining a
// room + publishing the mic, remote audio attach at constant volume, mute
// mapping to setMicrophoneEnabled, and stop disconnecting.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLivekitVoice, voiceSfuEnabled, type RoomLike } from './livekit.ts'
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

function harness() {
  const room = new FakeRoom()
  const attached: FakeTrack[] = []
  const detached: FakeTrack[] = []
  const statuses: MicStatus[] = []
  const latencies: number[] = []
  const mesh = createLivekitVoice({
    room,
    url: 'wss://example.livekit.cloud',
    token: 'jwt',
    attach: (t) => attached.push(t as FakeTrack),
    detach: (t) => detached.push(t as FakeTrack),
    onStatus: (s) => statuses.push(s),
    onJoinLatency: (ms) => latencies.push(ms),
  })
  return { room, mesh, attached, detached, statuses, latencies }
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
