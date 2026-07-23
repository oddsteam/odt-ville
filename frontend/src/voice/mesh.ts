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
import { connectLivekitRoom, voiceSfuEnabled } from './livekit.ts'
import { connectSignalling } from './write.ts'
import { iceConfig } from './iceConfig.ts'
import { micState } from './micState.ts'
import type { MicStatus, SignalMessage, VoicePosition } from './schema.ts'
import type { SignallingHandle } from './write.ts'

export interface VoiceDeps {
  // Our own Keycloak id — the glare tiebreak (below) needs it.
  ownId: string
  signalling: SignallingHandle
  getLocalStream: () => Promise<MediaStream>
  createConnection: () => RTCPeerConnection
  play: (peerId: string, stream: MediaStream) => void
  stopPlaying: (peerId: string) => void
  // Local mic state for the on-screen indicator + mute toggle (#282).
  onStatus?: (s: MicStatus) => void
}

export interface VoiceMesh {
  update(own: VoicePosition, roster: Map<string, VoicePosition>): void
  setMute(muted: boolean): void
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
  // Mute (#282) is one boolean applied to track.enabled — outbound audio stops
  // at the track, so peers hear real silence, not volume-zero cosmetics. It
  // rides the persistent localStream, so every peer that later joins the pod
  // reuses the same (disabled) track: a pod change never silently unmutes.
  let muted = false
  let denied = false // the browser declined getUserMedia — voice cleanly off

  // The local stream is audio-only (getUserMedia({audio:true})), so muting every
  // track mutes the mic. track.enabled = false stops it at the track — RTP goes
  // silent, peers hear nothing (not a volume-zero cosmetic).
  const applyMute = () => acquired?.getTracks().forEach((t) => (t.enabled = !muted))
  const report = () =>
    deps.onStatus?.({ live: !!acquired && !muted && !denied && peers.size > 0, muted, denied })

  // A declined permission caches its rejection here (the ??= below never re-runs
  // getUserMedia), so we prompt at most once and land in a clean disabled state.
  const mic = () =>
    (localStream ??= deps.getLocalStream().then(
      (s) => {
        acquired = s
        applyMute()
        report()
        return s
      },
      (e) => {
        denied = true
        report()
        throw e
      },
    ))

  // ponytail: no perfect-negotiation dance. Distance is symmetric, so both
  // sides see each other enter the pod at once and would both offer — glare.
  // The peer with the greater id initiates; the other waits and answers. One
  // deterministic comparison replaces the whole polite/impolite state machine.
  const weInitiate = (peerId: string) => deps.ownId > peerId

  async function open(peerId: string): Promise<RTCPeerConnection> {
    // Acquire the mic FIRST: a declined permission throws here, before any
    // connection is registered, so a refusal never leaves a half-open peer.
    const stream = await mic()
    const pc = deps.createConnection()
    peers.set(peerId, pc)
    pc.onicecandidate = (e) => {
      if (e.candidate) deps.signalling.send(peerId, { candidate: e.candidate })
    }
    pc.ontrack = (e) => deps.play(peerId, e.streams[0])
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    report()
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
    report()
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

  // A declined mic rejects mic() inside accept()/offer(); swallow it — `denied`
  // is already recorded and reported, and there is nothing left to do.
  deps.signalling.onSignal((m) => void accept(m).catch(() => {}))

  return {
    update(own, roster) {
      const want = new Set(podFor(own, roster).map((p) => p.userId))
      for (const peerId of peers.keys()) if (!want.has(peerId)) close(peerId)
      for (const peerId of want) {
        // Skip once the mic is denied — nothing to offer, and no re-prompt.
        if (!peers.has(peerId) && weInitiate(peerId) && !denied) void offer(peerId).catch(() => {})
      }
    },
    setMute(next) {
      muted = next
      applyMute()
      report()
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
  // ADR-0011: behind VITE_VOICE_SFU, audio rides a LiveKit SFU instead of the
  // mesh (the mesh can't traverse residential NAT, #290). Off => the mesh path
  // below is byte-for-byte unchanged; this slice deletes nothing.
  if (voiceSfuEnabled(import.meta.env as { VITE_VOICE_SFU?: string }))
    return connectLivekitRoom(slug, ownId)

  const signalling = connectSignalling(slug)
  if (!signalling) return null

  // One <audio> sink per peer, keyed by id so leave/rejoin reuses cleanly.
  const sinks = new Map<string, HTMLAudioElement>()
  // The inbound streams, exposed on window.__voice below: the e2e (#280) reads
  // one off here and runs it through an AnalyserNode to prove it is non-silent.
  // Same window-test-API precedent as MapScene's window.__game.
  const received = new Map<string, MediaStream>()
  if (typeof window !== 'undefined') window.__voice = { received }
  const mesh = createVoiceMesh({
    ownId,
    signalling,
    getLocalStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    // Cross-NAT peers relay via coturn when VITE_TURN_* is set (#283); with no
    // TURN config this is {} and two peers on one host / a LAN still connect on
    // host candidates alone (#280).
    createConnection: () => new RTCPeerConnection(iceConfig()),
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
    onStatus: (s) => micState.status(s),
  })
  // Light up the indicator + mute toggle and hand the store this mesh's mute
  // knob (which also pushes any standing mute in from the previous map). On
  // teardown the store goes dark but keeps the mute choice for the next mesh.
  micState.activate(mesh.setMute)
  return {
    update: mesh.update,
    setMute: mesh.setMute,
    stop: () => {
      mesh.stop()
      micState.deactivate()
    },
  }
}

// dev/e2e seam only; noop where there is no window (unit env).
declare global {
  interface Window {
    __voice?: { received: Map<string, MediaStream> }
  }
}
