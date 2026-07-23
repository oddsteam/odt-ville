// Proximity voice on a LiveKit SFU (ADR-0011, #309). The go/no-go slice: two
// browsers in the same map hear each other over LiveKit, where the mesh could
// not (#290, residential NAT). Runs behind VITE_VOICE_SFU, BESIDE the mesh —
// this file adds; it deletes nothing. mesh.ts / iceConfig.ts stay untouched.
//
// FLAT audio on purpose: everyone in the room at constant volume. Distance-
// scaled gain, proximity-gated membership and hysteresis are later slices — the
// only question here is whether two peers connect and hear each other.

import { Room, type RemoteTrack } from 'livekit-client'
import { getAuthToken } from '../lib/authToken.ts'
import { micState } from './micState.ts'
import { podFor } from './service.ts'
import { DWELL_MS, LEAVE_RADIUS, PREJOIN_RADIUS } from './schema.ts'
import type { MicStatus, VoicePosition } from './schema.ts'
import type { VoiceMesh } from './mesh.ts'

// A Vite flag is a string, so `VITE_VOICE_SFU=false` is a truthy string — the
// classic footgun. On only for an explicit truthy value.
export function voiceSfuEnabled(env: { VITE_VOICE_SFU?: string }): boolean {
  return env.VITE_VOICE_SFU === '1' || env.VITE_VOICE_SFU === 'true'
}

// Just enough of livekit-client's Room to test the join/mute/stop wiring against
// a fake — the adapter below hands the real Room in.
export interface RoomLike {
  on(event: string, cb: (...args: unknown[]) => void): unknown
  connect(url: string, token: string): Promise<void>
  disconnect(): Promise<void> | void
  localParticipant: { setMicrophoneEnabled(enabled: boolean): Promise<unknown> }
}

interface RemoteTrackLike {
  kind: string
}

export interface LivekitDeps {
  room: RoomLike
  url: string
  // The room token (#308) is minted server-side, so it arrives async — the
  // adapter passes the in-flight fetch straight in.
  token: string | Promise<string>
  // Attach/detach a subscribed remote track's media element (DOM lives in the
  // adapter, so the core stays testable in node).
  attach: (track: RemoteTrackLike) => void
  detach: (track: RemoteTrackLike) => void
  onStatus?: (s: MicStatus) => void
  // The measured room-join latency, emitted on each connect (#310 spike output).
  onJoinLatency?: (ms: number) => void
  // Overridable for tests; defaults to the tuned constants / wall clock.
  dwellMs?: number
  now?: () => number
}

// LiveKit RoomEvent string values (livekit-client uses these literals).
const TRACK_SUBSCRIBED = 'trackSubscribed'
const TRACK_UNSUBSCRIBED = 'trackUnsubscribed'

export function createLivekitVoice(deps: LivekitDeps): VoiceMesh {
  const { room, url, token, attach, detach } = deps
  const dwellMs = deps.dwellMs ?? DWELL_MS
  const now = deps.now ?? (() => Date.now())
  let connected = false
  let joining = false // a connect() is in flight — don't start a second
  let muted = false
  let denied = false // the browser declined the mic — voice cleanly off
  let leaveTimer: ReturnType<typeof setTimeout> | null = null

  const report = () =>
    deps.onStatus?.({ live: connected && !muted && !denied, muted, denied })

  room.on(TRACK_SUBSCRIBED, (track) => {
    const t = track as RemoteTrackLike
    if (t.kind === 'audio') {
      attach(t)
      report()
    }
  })
  room.on(TRACK_UNSUBSCRIBED, (track) => detach(track as RemoteTrackLike))

  // Fetch the token, connect, then publish the mic. A token/connect failure just
  // leaves voice off; only a declined mic reports `denied` (it lights the
  // mic-blocked indicator), so the two aren't conflated. Idempotent — a second
  // caller while connected/connecting is a no-op, so a peer lingering in range
  // never re-joins (and never re-pays LiveKit's 1-minute floor, #298).
  async function join() {
    if (connected || joining) return
    joining = true
    const t0 = now()
    try {
      await room.connect(url, await token)
      connected = true
      deps.onJoinLatency?.(now() - t0) // measured lead time (#310)
      report()
      try {
        await room.localParticipant.setMicrophoneEnabled(!muted)
      } catch {
        denied = true
      }
      report()
    } finally {
      joining = false
    }
  }

  const cancelLeave = () => {
    if (leaveTimer !== null) {
      clearTimeout(leaveTimer)
      leaveTimer = null
    }
  }

  function leave() {
    if (!connected) return
    connected = false
    void room.disconnect()
    report()
  }

  // Proximity-gated membership with three-radius hysteresis (ADR-0011, #310):
  // join once a peer enters the (wide) pre-join band; stay connected through the
  // dead-band out to LEAVE_RADIUS; disconnect only after the pod clears that band
  // for DWELL_MS. Map entry never joins — this reconciler is what does.
  function update(own: VoicePosition, roster: Map<string, VoicePosition>) {
    const nearby = podFor(own, roster, PREJOIN_RADIUS).length > 0
    const holding = podFor(own, roster, LEAVE_RADIUS).length > 0
    if (nearby) {
      cancelLeave()
      void join().catch(report)
    } else if (!holding && connected && leaveTimer === null) {
      leaveTimer = setTimeout(() => {
        leaveTimer = null
        leave()
      }, dwellMs)
    }
  }

  return {
    update,
    setMute(next) {
      muted = next
      if (connected) void room.localParticipant.setMicrophoneEnabled(!muted).catch(() => {})
      report()
    },
    stop() {
      cancelLeave()
      leave()
    },
  }
}

// Server-minted room token (#308): the secret never touches the browser. Lib-only
// I/O keeps voice inside its arch boundary (getAuthToken lives in src/lib).
async function fetchRoomToken(slug: string, authToken: string): Promise<string> {
  const res = await fetch(`/api/v1/voice/token?map=${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  if (!res.ok) throw new Error(`voice token request failed: ${res.status}`)
  const { token } = (await res.json()) as { token: string }
  return token
}

// Browser adapter: the real livekit-client Room wired from env + the #308 token.
// Same shape as mesh.ts's connectVoice — returns null (voice cleanly off) when
// there is no LiveKit URL or no auth token. `ownId` is unused: LiveKit takes the
// participant identity from the server-minted token, not the client.
export function connectLivekitRoom(slug: string, _ownId: string): VoiceMesh | null {
  const url = import.meta.env.VITE_LIVEKIT_URL as string | undefined
  const authToken = getAuthToken()
  if (!url || !authToken) return null

  const room = new Room()
  const mesh = createLivekitVoice({
    room,
    url,
    token: fetchRoomToken(slug, authToken),
    // Flat MVP: attach every remote audio track at its default volume and let it
    // autoplay. Distance-scaled gain is a later slice (ADR-0011).
    attach: (track) => {
      const el = (track as RemoteTrack).attach()
      el.autoplay = true
      document.body.appendChild(el)
    },
    detach: (track) => (track as RemoteTrack).detach().forEach((el) => el.remove()),
    onStatus: (s) => micState.status(s),
    // Spike output (#310): log the real join latency so PREJOIN_RADIUS can be
    // re-derived from measurement rather than the current estimate.
    onJoinLatency: (ms) => console.info(`[voice] livekit join latency ${Math.round(ms)}ms`),
  })
  // Light up the mic indicator + mute toggle the same way the mesh does, and
  // tear the store down on stop (the standing mute choice survives, #282).
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
