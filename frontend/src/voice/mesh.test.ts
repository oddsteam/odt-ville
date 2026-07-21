// The mic-consent behaviours added in #282, unit-tested against fake WebRTC
// objects (jsdom has no RTCPeerConnection). Covers: track-level mute, mute
// surviving a new peer joining the pod, live/muted status reporting, and a
// declined getUserMedia leaving voice cleanly off — once, no repeat prompt,
// no half-open connection.

import { describe, expect, it, vi } from 'vitest'
import { createVoiceMesh, type VoiceDeps } from './mesh.ts'
import type { MicStatus, VoicePosition } from './schema.ts'

class FakeTrack {
  kind = 'audio'
  enabled = true
  stopped = false
  stop() {
    this.stopped = true
  }
}

class FakeStream {
  tracks = [new FakeTrack()]
  getTracks() {
    return this.tracks
  }
  getAudioTracks() {
    return this.tracks
  }
}

class FakePC {
  added: FakeTrack[] = []
  closed = false
  localDescription: unknown = null
  onicecandidate: unknown = null
  ontrack: unknown = null
  addTrack(t: FakeTrack) {
    this.added.push(t)
  }
  async createOffer() {
    return { type: 'offer', sdp: 'o' }
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'a' }
  }
  async setLocalDescription(d: unknown) {
    this.localDescription = d
  }
  async setRemoteDescription() {}
  async addIceCandidate() {}
  close() {
    this.closed = true
  }
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

// ownId 'zzz' outranks any lowercase peer id, so we are the initiator and drive
// open()/offer() ourselves — no inbound signalling needed to bring a peer up.
function harness(getLocalStream?: VoiceDeps['getLocalStream']) {
  const pcs: FakePC[] = []
  const stream = new FakeStream()
  const statuses: MicStatus[] = []
  let getCalls = 0
  const mesh = createVoiceMesh({
    ownId: 'zzz',
    signalling: { send: () => {}, onSignal: () => {}, disconnect: () => {} },
    getLocalStream:
      getLocalStream ??
      (async () => {
        getCalls++
        return stream as unknown as MediaStream
      }),
    createConnection: () => {
      const pc = new FakePC()
      pcs.push(pc)
      return pc as unknown as RTCPeerConnection
    },
    play: () => {},
    stopPlaying: () => {},
    onStatus: (s) => statuses.push(s),
  })
  return { mesh, pcs, stream, statuses, getCalls: () => getCalls }
}

const at = (x: number): VoicePosition => ({ x, y: 0 })
const roster = (...ids: string[]) => new Map(ids.map((id) => [id, at(0)]))

describe('voice mesh mute + consent (#282)', () => {
  it('mutes and unmutes at the track level', async () => {
    const h = harness()
    h.mesh.update(at(0), roster('aaa'))
    await flush()
    expect(h.stream.tracks[0].enabled).toBe(true)

    h.mesh.setMute(true)
    expect(h.stream.tracks[0].enabled).toBe(false)

    h.mesh.setMute(false)
    expect(h.stream.tracks[0].enabled).toBe(true)
  })

  it('keeps a later peer muted — the same disabled track is handed to it', async () => {
    const h = harness()
    h.mesh.update(at(0), roster('aaa'))
    await flush()
    h.mesh.setMute(true)

    h.mesh.update(at(0), roster('aaa', 'bbb')) // a second peer enters the pod
    await flush()

    const second = h.pcs[1]
    expect(second.added[0]).toBe(h.stream.tracks[0]) // reuses the one local track
    expect(second.added[0].enabled).toBe(false) // still muted, not silently reopened
  })

  it('reports live when heard, and not live once muted', async () => {
    const h = harness()
    h.mesh.update(at(0), roster('aaa'))
    await flush()
    expect(h.statuses.at(-1)).toEqual({ live: true, muted: false, denied: false })

    h.mesh.setMute(true)
    expect(h.statuses.at(-1)).toEqual({ live: false, muted: true, denied: false })
  })

  it('leaves voice cleanly off when the mic permission is declined', async () => {
    let calls = 0
    const denied = async () => {
      calls++
      throw new DOMException('denied', 'NotAllowedError')
    }
    const h = harness(denied)

    h.mesh.update(at(0), roster('aaa'))
    await flush()
    expect(h.statuses.at(-1)).toEqual({ live: false, muted: false, denied: true })
    expect(h.pcs).toHaveLength(0) // no half-open connection left behind

    h.mesh.update(at(0), roster('aaa')) // still nearby — must not re-prompt
    await flush()
    expect(calls).toBe(1)
  })
})
