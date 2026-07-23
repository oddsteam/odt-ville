// The LiveKit SFU voice path (#309, ADR-0011), unit-tested against a fake Room
// (jsdom has no livekit-client / no real SFU). Covers: the flag gate, joining a
// room + publishing the mic, remote audio attach at constant volume, mute
// mapping to setMicrophoneEnabled, and stop disconnecting.

import { describe, expect, it } from 'vitest'
import { createLivekitVoice, voiceSfuEnabled, type RoomLike } from './livekit.ts'
import type { MicStatus } from './schema.ts'

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
  const mesh = createLivekitVoice({
    room,
    url: 'wss://example.livekit.cloud',
    token: 'jwt',
    attach: (t) => attached.push(t as FakeTrack),
    detach: (t) => detached.push(t as FakeTrack),
    onStatus: (s) => statuses.push(s),
  })
  return { room, mesh, attached, detached, statuses }
}

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
  it('joins the room and publishes the mic', async () => {
    const { room } = harness()
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
    await flush()
    expect(statuses.at(-1)).toEqual({ live: true, muted: false, denied: false })

    mesh.setMute(true)
    await flush()
    expect(room.micEnabled).toBe(false)
    expect(statuses.at(-1)).toEqual({ live: false, muted: true, denied: false })
  })

  it('stop disconnects the room', async () => {
    const { room, mesh } = harness()
    await flush()
    mesh.stop()
    expect(room.disconnected).toBe(true)
  })
})
