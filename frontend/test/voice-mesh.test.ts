import { describe, it, expect, vi } from 'vitest'
import { connectVoice, createVoiceMesh, type VoiceDeps } from '../src/voice/mesh.ts'
import { setAuthToken } from '../src/lib/authToken.ts'
import type { SignalMessage, VoicePosition } from '../src/voice/schema.ts'
import type { SignallingHandle } from '../src/voice/write.ts'

// A fake RTCPeerConnection: records the handshake calls and lets the test fire
// the two events the mesh listens for (icecandidate, track). No real WebRTC —
// jsdom has none, and the driver's whole job is orchestration, not media.
class FakePC {
  localDescription: unknown = null
  remoteDescription: unknown = null
  added: unknown[] = []
  tracks: unknown[] = []
  closed = false
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null
  ontrack: ((e: { streams: MediaStream[] }) => void) | null = null
  addTrack(track: unknown, stream: unknown) {
    this.tracks.push({ track, stream })
  }
  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'OFFER' })
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'ANSWER' })
  }
  setLocalDescription(d: unknown) {
    this.localDescription = d
    return Promise.resolve()
  }
  setRemoteDescription(d: unknown) {
    this.remoteDescription = d
    return Promise.resolve()
  }
  addIceCandidate(c: unknown) {
    this.added.push(c)
    return Promise.resolve()
  }
  close() {
    this.closed = true
  }
}

const at = (x: number, y: number): VoicePosition => ({ x, y })
const rosterOf = (peers: Record<string, VoicePosition>) => new Map(Object.entries(peers))
const flush = () => new Promise((r) => setTimeout(r, 0))

// Let one inbound-signal handler be captured so tests can push frames in.
function makeSignalling() {
  let onSignal: ((m: SignalMessage) => void) | null = null
  const handle: SignallingHandle = {
    send: vi.fn(),
    onSignal: (cb) => {
      onSignal = cb
    },
    disconnect: vi.fn(),
  }
  return { handle, deliver: (m: SignalMessage) => onSignal?.(m) }
}

function harness(ownId: string) {
  const { handle, deliver } = makeSignalling()
  const pcs: FakePC[] = []
  const micTrack = { stop: vi.fn() }
  const stream = { getTracks: () => [micTrack] } as unknown as MediaStream
  const deps: VoiceDeps = {
    ownId,
    signalling: handle,
    getLocalStream: () => Promise.resolve(stream),
    createConnection: () => {
      const pc = new FakePC()
      pcs.push(pc)
      return pc as unknown as RTCPeerConnection
    },
    play: vi.fn(),
    stopPlaying: vi.fn(),
  }
  return { mesh: createVoiceMesh(deps), deps, pcs, deliver, micTrack, handle }
}

const own = at(10, 10)

describe('createVoiceMesh', () => {
  // ownId 'z' beats every peer id below, so we are the glare-free initiator.
  it('opens an offer to a peer entering the pod, addressed over the relay', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10) }))
    await flush()

    expect(h.pcs).toHaveLength(1)
    expect(h.pcs[0].tracks).toHaveLength(1) // local mic added
    expect(h.deps.signalling.send).toHaveBeenCalledWith('alice', {
      type: 'offer',
      sdp: 'OFFER',
    })
  })

  it('does not re-offer to a peer already connected', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10) }))
    await flush()
    h.mesh.update(own, rosterOf({ alice: at(12, 10) }))
    await flush()

    expect(h.pcs).toHaveLength(1)
  })

  // The polite side (lower id) never offers; it waits for the offer and answers.
  it('answers an inbound offer and returns the answer over the relay', async () => {
    const h = harness('a')
    h.mesh.update(own, rosterOf({ zed: at(11, 10) })) // polite: no proactive offer
    await flush()
    expect(h.deps.signalling.send).not.toHaveBeenCalled()

    h.deliver({ type: 'signal', from: 'zed', payload: { type: 'offer', sdp: 'THEIRS' } })
    await flush()

    expect(h.pcs).toHaveLength(1)
    expect(h.pcs[0].remoteDescription).toEqual({ type: 'offer', sdp: 'THEIRS' })
    expect(h.deps.signalling.send).toHaveBeenCalledWith('zed', {
      type: 'answer',
      sdp: 'ANSWER',
    })
  })

  it('applies an inbound answer to the pending connection', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10) }))
    await flush()

    h.deliver({ type: 'signal', from: 'alice', payload: { type: 'answer', sdp: 'BACK' } })
    await flush()

    expect(h.pcs[0].remoteDescription).toEqual({ type: 'answer', sdp: 'BACK' })
  })

  it('trickles local ICE candidates to the peer over the relay', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10) }))
    await flush()

    const candidate = { candidate: 'host', sdpMid: '0' }
    h.pcs[0].onicecandidate?.({ candidate })

    expect(h.deps.signalling.send).toHaveBeenCalledWith('alice', { candidate })
  })

  it('ignores the null end-of-candidates event', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10) }))
    await flush()
    ;(h.deps.signalling.send as ReturnType<typeof vi.fn>).mockClear()

    h.pcs[0].onicecandidate?.({ candidate: null })

    expect(h.deps.signalling.send).not.toHaveBeenCalled()
  })

  it('adds an inbound ICE candidate to the peer connection', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10) }))
    await flush()

    const candidate = { candidate: 'host', sdpMid: '0' }
    h.deliver({ type: 'signal', from: 'alice', payload: { candidate } })
    await flush()

    expect(h.pcs[0].added).toEqual([candidate])
  })

  it('plays an inbound audio track from the peer', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10) }))
    await flush()

    const stream = {} as MediaStream
    h.pcs[0].ontrack?.({ streams: [stream] })

    expect(h.deps.play).toHaveBeenCalledWith('alice', stream)
  })

  it('closes and releases a peer that leaves the pod', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10) }))
    await flush()

    h.mesh.update(own, new Map())
    await flush()

    expect(h.pcs[0].closed).toBe(true)
    expect(h.deps.stopPlaying).toHaveBeenCalledWith('alice')
  })

  it('never opens more than POD_CAP connections', async () => {
    const crowd: Record<string, VoicePosition> = {}
    // Ten peers, all inside the radius and all with ids below 'z' (we initiate).
    for (let i = 0; i < 10; i++) crowd[`peer${i}`] = at(10 + (i + 1) * 0.15, 10)

    const h = harness('z')
    h.mesh.update(own, rosterOf(crowd))
    await flush()

    expect(h.pcs).toHaveLength(6)
  })

  it('stop() closes every connection and releases the mic', async () => {
    const h = harness('z')
    h.mesh.update(own, rosterOf({ alice: at(11, 10), bob: at(9, 10) }))
    await flush()

    h.mesh.stop()

    expect(h.pcs.every((pc) => pc.closed)).toBe(true)
    expect(h.micTrack.stop).toHaveBeenCalled()
    expect(h.deps.signalling.disconnect).toHaveBeenCalled()
  })
})

describe('connectVoice', () => {
  it('does not open without an auth token', () => {
    setAuthToken(null)
    expect(connectVoice('plaza', 'me')).toBeNull()
  })
})
