// Proximity voice (#159), media layer (#280): the mesh. Given where we stand
// and the presence roster, it holds one RTCPeerConnection open to each peer in
// the pod (podFor, #278), negotiated over the #279 relay, and plays their
// inbound audio. A peer leaving the radius has their link torn down.
//
// Media is peer-to-peer — audio never touches the app server; only the SDP/ICE
// handshake rides the (authenticated) signalling relay. Browser globals
// (RTCPeerConnection, MediaStream) are ambient, so this stays inside voice's
// arch boundary — no import of the game, no data service (see .dependency-cruiser).

import { podFor } from './service.ts'
import { connectSignalling } from './write.ts'
import type { SignalMessage, VoicePosition } from './schema.ts'
import type { SignallingHandle } from './write.ts'

export interface VoiceDeps {
  // Our own Keycloak id — the glare tiebreak (below) needs it.
  ownId: string
  signalling: SignallingHandle
  getLocalStream: () => Promise<MediaStream>
  createConnection: () => RTCPeerConnection
  play: (peerId: string, stream: MediaStream) => void
  stopPlaying: (peerId: string) => void
}

export interface VoiceMesh {
  update(own: VoicePosition, roster: Map<string, VoicePosition>): void
  stop(): void
}

// A signalling payload is either an SDP description (has `.sdp`) or a trickled
// ICE candidate (has `.candidate`). Opaque on the wire (#279); narrowed here.
const isDescription = (p: unknown): p is RTCSessionDescriptionInit =>
  typeof p === 'object' && p !== null && 'sdp' in p

export function createVoiceMesh(deps: VoiceDeps): VoiceMesh {
  const peers = new Map<string, RTCPeerConnection>()
  let localStream: Promise<MediaStream> | null = null
  let acquired: MediaStream | null = null

  const mic = () =>
    (localStream ??= deps.getLocalStream().then((s) => (acquired = s)))

  // ponytail: no perfect-negotiation dance. Distance is symmetric, so both
  // sides see each other enter the pod at once and would both offer — glare.
  // The peer with the greater id initiates; the other waits and answers. One
  // deterministic comparison replaces the whole polite/impolite state machine.
  const weInitiate = (peerId: string) => deps.ownId > peerId

  async function open(peerId: string): Promise<RTCPeerConnection> {
    const pc = deps.createConnection()
    peers.set(peerId, pc)
    pc.onicecandidate = (e) => {
      if (e.candidate) deps.signalling.send(peerId, { candidate: e.candidate })
    }
    pc.ontrack = (e) => deps.play(peerId, e.streams[0])
    const stream = await mic()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    return pc
  }

  async function offer(peerId: string) {
    const pc = await open(peerId)
    await pc.setLocalDescription(await pc.createOffer())
    deps.signalling.send(peerId, pc.localDescription!)
  }

  function close(peerId: string) {
    peers.get(peerId)?.close()
    peers.delete(peerId)
    deps.stopPlaying(peerId)
  }

  async function accept(message: SignalMessage) {
    const { from, payload } = message
    if (isDescription(payload)) {
      if (payload.type === 'offer') {
        // The polite side (or a cold start): open on demand. Respect the cap —
        // a stray offer must never push us past POD_CAP live connections.
        if (!peers.has(from) && peers.size >= 6) return
        const pc = peers.get(from) ?? (await open(from))
        await pc.setRemoteDescription(payload)
        await pc.setLocalDescription(await pc.createAnswer())
        deps.signalling.send(from, pc.localDescription!)
      } else {
        await peers.get(from)?.setRemoteDescription(payload)
      }
    } else if (payload && typeof payload === 'object' && 'candidate' in payload) {
      await peers.get(from)?.addIceCandidate(
        (payload as { candidate: RTCIceCandidateInit }).candidate,
      )
    }
  }

  deps.signalling.onSignal((m) => void accept(m))

  return {
    update(own, roster) {
      const want = new Set(podFor(own, roster).map((p) => p.userId))
      for (const peerId of peers.keys()) if (!want.has(peerId)) close(peerId)
      for (const peerId of want) {
        if (!peers.has(peerId) && weInitiate(peerId)) void offer(peerId)
      }
    },
    stop() {
      for (const peerId of [...peers.keys()]) close(peerId)
      // Release the mic. If a grant is still in flight, stop it on resolve.
      acquired?.getTracks().forEach((t) => t.stop())
      if (!acquired) localStream?.then((s) => s.getTracks().forEach((t) => t.stop()))
      deps.signalling.onSignal(null)
      deps.signalling.disconnect()
    },
  }
}

// Browser adapter: the real deps wired from platform APIs. The shell creates
// this and injects it into MapScene via the registry — the same path presence
// takes, so the game never imports voice (see game-runtime-never-imports-voice).
// Null when there is no auth token (connectSignalling gates on it).
export function connectVoice(slug: string, ownId: string): VoiceMesh | null {
  const signalling = connectSignalling(slug)
  if (!signalling) return null

  // One <audio> sink per peer, keyed by id so leave/rejoin reuses cleanly.
  const sinks = new Map<string, HTMLAudioElement>()
  // The inbound streams, exposed on window.__voice below: the e2e (#280) reads
  // one off here and runs it through an AnalyserNode to prove it is non-silent.
  // Same window-test-API precedent as MapScene's window.__game.
  const received = new Map<string, MediaStream>()
  if (typeof window !== 'undefined') window.__voice = { received }
  return createVoiceMesh({
    ownId,
    signalling,
    getLocalStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    // ponytail: no iceServers. Two peers on one host / a LAN connect on host
    // candidates alone (#280); cross-NAT needs STUN/TURN (coturn, #281+).
    createConnection: () => new RTCPeerConnection(),
    play: (peerId, stream) => {
      received.set(peerId, stream)
      const el = sinks.get(peerId) ?? new Audio()
      el.srcObject = stream
      el.autoplay = true
      void el.play().catch(() => {}) // autoplay policy may defer; flat MVP
      sinks.set(peerId, el)
    },
    stopPlaying: (peerId) => {
      received.delete(peerId)
      const el = sinks.get(peerId)
      if (!el) return
      el.srcObject = null
      sinks.delete(peerId)
    },
  })
}

// dev/e2e seam only; noop where there is no window (unit env).
declare global {
  interface Window {
    __voice?: { received: Map<string, MediaStream> }
  }
}
