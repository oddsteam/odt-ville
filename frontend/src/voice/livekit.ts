// Proximity voice on a LiveKit SFU (ADR-0011, #309). The go/no-go slice: two
// browsers in the same map hear each other over LiveKit, where the mesh could
// not (#290, residential NAT). Runs behind VITE_VOICE_SFU, BESIDE the mesh —
// this file adds; it deletes nothing. mesh.ts / iceConfig.ts stay untouched.
//
// FLAT audio on purpose: everyone in the room at constant volume. Distance-
// scaled gain is a later slice — inside a room, everyone hears everyone at gain
// 1.0, which is exactly what a meeting room wants (#486).
//
// Which room you are in is a function of *position* (#486): outside every
// authored meeting rect you are proximity-gated into `map-<slug>`; inside one
// you drop that room and join `meeting-<roomId>` with everyone else standing
// there, no proximity cap. The resolver (room.ts) is handed plain rects — the
// game runtime is never imported (voice-depends-only-on-shared-infrastructure).

import { Room, type RemoteTrack } from 'livekit-client'
import { getAuthToken } from '../lib/authToken.ts'
import { micState } from './micState.ts'
import { podFor } from './service.ts'
import { resolveRoom, type MeetingRect } from './room.ts'
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
  // Mint (server-side, #308) the token for a room key — `map-<slug>` for the
  // proximity room, `meeting-<roomId>` for a meeting room. Called once per join,
  // so a room switch fetches the token scoped to the room it is joining.
  getToken: (roomKey: string) => string | Promise<string>
  // This map's proximity room key (`map-<slug>`), joined when outside every rect.
  proximityRoom: string
  // This map's authored meeting rects (#486); empty when it authors none. Plain
  // data — voice never imports the map or the scene to get them.
  meetingRects?: readonly MeetingRect[]
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
  const { room, url, getToken, proximityRoom, attach, detach } = deps
  const meetingRects = deps.meetingRects ?? []
  const dwellMs = deps.dwellMs ?? DWELL_MS
  const now = deps.now ?? (() => Date.now())
  // The room we hold or are joining (null = disconnected). The proximity room
  // and a meeting room are never held at once (#486) — a switch leaves one
  // before joining the other.
  let currentRoom: string | null = null
  let connected = false
  let joining = false // a connect() is in flight — don't start a second
  let muted = false
  let denied = false // the browser declined the mic — voice cleanly off
  let leaveTimer: ReturnType<typeof setTimeout> | null = null
  // The last position/roster, so a dwell timer firing later re-resolves against
  // where we actually are now, not where we were when it was armed.
  let lastOwn: VoicePosition = { x: 0, y: 0 }
  let lastRoster: Map<string, VoicePosition> = new Map()

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

  // Fetch the room's token, connect, then publish the mic. A token/connect
  // failure just leaves voice off; only a declined mic reports `denied` (it
  // lights the mic-blocked indicator), so the two aren't conflated.
  async function connectTo(roomKey: string) {
    if (joining) return
    joining = true
    currentRoom = roomKey
    const t0 = now()
    try {
      await room.connect(url, await getToken(roomKey))
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

  function disconnect() {
    if (!connected) return
    connected = false
    void room.disconnect()
    report()
  }

  // Move to `target` (a room key, or null = disconnected). Leaves the current
  // room first, so the two are never held at once. A no-op when already there.
  function switchTo(target: string | null) {
    if (target === currentRoom && (connected || joining)) return
    disconnect()
    if (target === null) {
      currentRoom = null
      return
    }
    void connectTo(target).catch(report)
  }

  // Which room do we *want* to be in right now? Inside a meeting rect → that
  // room, unconditionally (you are in the call the moment you step in, alone or
  // not, no POD_CAP). Outside → the proximity room, but only when a peer is in
  // earshot, with the three-radius hysteresis (#310): join on the pre-join band,
  // hold through the dead-band out to LEAVE_RADIUS, want-out beyond it.
  function desiredRoom(own: VoicePosition, roster: Map<string, VoicePosition>): string | null {
    const room = resolveRoom(own, meetingRects, proximityRoom)
    if (room !== proximityRoom) return room
    if (podFor(own, roster, PREJOIN_RADIUS).length > 0) return proximityRoom
    const holding = podFor(own, roster, LEAVE_RADIUS).length > 0
    return holding && currentRoom === proximityRoom ? proximityRoom : null
  }

  // Reconcile the connection with where we want to be. Entering a meeting room,
  // and any join from nothing, are immediate. Leaving a room — a meeting on the
  // way out, or the proximity room once the pod empties — waits DWELL_MS, so a
  // doorway boundary never thrashes a billed LiveKit minute (#298).
  function reconcile(own: VoicePosition, roster: Map<string, VoicePosition>) {
    const desired = desiredRoom(own, roster)
    if (desired === currentRoom) {
      cancelLeave()
      return
    }
    const enteringMeeting = desired !== null && desired !== proximityRoom
    if (enteringMeeting || currentRoom === null) {
      cancelLeave()
      switchTo(desired)
      return
    }
    if (leaveTimer === null) {
      leaveTimer = setTimeout(() => {
        leaveTimer = null
        switchTo(desiredRoom(lastOwn, lastRoster))
      }, dwellMs)
    }
  }

  function update(own: VoicePosition, roster: Map<string, VoicePosition>) {
    lastOwn = own
    lastRoster = roster
    reconcile(own, roster)
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
      disconnect()
      currentRoom = null
    },
  }
}

// Server-minted room token (#308): the secret never touches the browser. Lib-only
// I/O keeps voice inside its arch boundary (getAuthToken lives in src/lib). The
// room key names which token to mint: `meeting-<roomId>` asks Rails to authorize
// a meeting zone on this map (#486); anything else is the proximity room. Rails
// verifies the meeting is authored on a map the caller can reach — the browser
// never gets to name an arbitrary room.
async function fetchRoomToken(slug: string, authToken: string, roomKey: string): Promise<string> {
  const meetingId = roomKey.startsWith('meeting-') ? roomKey.slice('meeting-'.length) : null
  const q = meetingId
    ? `map=${encodeURIComponent(slug)}&meeting=${encodeURIComponent(meetingId)}`
    : `map=${encodeURIComponent(slug)}`
  const res = await fetch(`/api/v1/voice/token?${q}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  if (!res.ok) throw new Error(`voice token request failed: ${res.status}`)
  const { token } = (await res.json()) as { token: string }
  return token
}

// Browser adapter: the real livekit-client Room wired from env + the #308 token.
// Same shape as mesh.ts's connectVoice — returns null (voice cleanly off) when
// there is no LiveKit URL or no auth token. `ownId` is unused: LiveKit takes the
// participant identity from the server-minted token, not the client. `meetingRects`
// are this map's authored meeting zones (#486), passed as plain data.
export function connectLivekitRoom(
  slug: string,
  _ownId: string,
  meetingRects: readonly MeetingRect[] = [],
): VoiceMesh | null {
  const url = import.meta.env.VITE_LIVEKIT_URL as string | undefined
  const authToken = getAuthToken()
  if (!url || !authToken) return null

  const room = new Room()
  const mesh = createLivekitVoice({
    room,
    url,
    proximityRoom: `map-${slug}`,
    meetingRects,
    getToken: (roomKey) => fetchRoomToken(slug, authToken, roomKey),
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
