// Proximity voice on a LiveKit SFU (ADR-0011, #309). Two browsers in the same
// map hear each other over LiveKit, where the mesh could not (#290, residential
// NAT). This is the only transport now — ADR-0011 retired the peer mesh (#517).
//
// FLAT audio on purpose: everyone in the room at constant volume. Distance-
// scaled gain is a later slice — inside a room, everyone hears everyone at gain
// 1.0, which is exactly what a meeting room wants (#486).
//
// Which room you are in is a function of *position* (#486): outside every
// authored meeting zone you are proximity-gated into the map's own room; inside
// one you drop that room and join the meeting room with everyone else standing
// there, no proximity cap. Room keys come from schema.ts's roomKey (#518). The
// resolver (room.ts) is handed the map's authored zones — the game runtime is
// never imported (voice-depends-only-on-shared-infrastructure).
//
// This file is connection + hysteresis only (#524): the meeting call — camera,
// screen share, the remote filmstrip — lives in meeting.ts, which we hand the
// room's local publisher and forward the room events to.

import { Room, type RemoteTrack } from 'livekit-client'
import { getAuthToken } from '../lib/authToken.ts'
import { micState } from './micState.ts'
import { podFor } from './service.ts'
import { resolveRoom } from './room.ts'
import {
  createMeeting,
  type MeetingDeps,
  type PublicationLike,
  type RemoteParticipantLike,
  type RemoteTrackLike,
} from './meeting.ts'
import { meetingState } from './meetingState.ts'
import { DWELL_MS, LEAVE_RADIUS, PREJOIN_RADIUS, parseRoomKey, roomKey } from './schema.ts'
import type { MicStatus, VoiceHandle, VoicePosition } from './schema.ts'
import type { Zone } from '../kernel/schema.ts'

// Just enough of livekit-client's Room to test the join/mute/stop wiring against
// a fake — the adapter below hands the real Room in.
export interface RoomLike {
  on(event: string, cb: (...args: unknown[]) => void): unknown
  connect(url: string, token: string): Promise<void>
  disconnect(): Promise<void> | void
  localParticipant: {
    setMicrophoneEnabled(enabled: boolean): Promise<unknown>
    setCameraEnabled(enabled: boolean): Promise<PublicationLike | undefined>
    setScreenShareEnabled(enabled: boolean): Promise<PublicationLike | undefined>
  }
  // Participants already in the room at connect time (#488) — livekit populates
  // this before we get any participantConnected event. Absent in the mesh tests.
  remoteParticipants?: Map<string, RemoteParticipantLike>
}

// The meeting HUD callbacks (onCamera/attachSelfView/detachSelfView/
// onParticipants/onScreenShare) are the meeting module's — declared once on
// MeetingDeps and passed straight through, so the two never drift.
export interface LivekitDeps
  extends Pick<MeetingDeps, 'onCamera' | 'attachSelfView' | 'detachSelfView' | 'onParticipants' | 'onScreenShare'> {
  room: RoomLike
  url: string
  // Mint (server-side, #308) the token for a room key (schema.ts roomKey, #518) —
  // the map's own room, or a meeting room. Called once per join, so a room switch
  // fetches the token scoped to the room it is joining.
  getToken: (key: string) => string | Promise<string>
  // This map's proximity room key, joined when outside every meeting zone.
  proximityRoom: string
  // This map's authored zones (#486); the resolver reads the meeting ones off
  // them. Plain data — voice never imports the map or the scene to get them.
  zones?: readonly Zone[]
  // Attach/detach a subscribed remote audio track's media element (DOM lives in
  // the adapter, so the core stays testable in node).
  attach: (track: RemoteTrackLike) => void
  detach: (track: RemoteTrackLike) => void
  onStatus?: (s: MicStatus) => void
  // Meeting-room membership for the HUD (#487): true when we hold a meeting room,
  // false when we leave it. Drives whether the meeting overlay is shown.
  onMeeting?: (inMeeting: boolean) => void
  // The measured room-join latency, emitted on each connect (#310 spike output).
  onJoinLatency?: (ms: number) => void
  // Overridable for tests; defaults to the tuned constants / wall clock.
  dwellMs?: number
  now?: () => number
}

// LiveKit RoomEvent string values (livekit-client uses these literals).
const TRACK_SUBSCRIBED = 'trackSubscribed'
const TRACK_UNSUBSCRIBED = 'trackUnsubscribed'
const PARTICIPANT_CONNECTED = 'participantConnected'
const PARTICIPANT_DISCONNECTED = 'participantDisconnected'
const ACTIVE_SPEAKERS_CHANGED = 'activeSpeakersChanged'
const LOCAL_TRACK_UNPUBLISHED = 'localTrackUnpublished'

export function createLivekitVoice(deps: LivekitDeps): VoiceHandle {
  const { room, url, getToken, proximityRoom, attach, detach } = deps
  const zones = deps.zones ?? []
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
  let inMeeting = false // last-reported onMeeting edge
  let leaveTimer: ReturnType<typeof setTimeout> | null = null
  // The last position/roster, so a dwell timer firing later re-resolves against
  // where we actually are now, not where we were when it was armed.
  let lastOwn: VoicePosition = { x: 0, y: 0 }
  let lastRoster: Map<string, VoicePosition> = new Map()

  // The meeting call (#487/#488/#489) — camera, share, and the remote filmstrip.
  // It reports out through the same deps callbacks; livekit forwards it the room
  // events and drives it in and out as membership changes.
  const meeting = createMeeting({
    local: room.localParticipant,
    onCamera: deps.onCamera,
    attachSelfView: deps.attachSelfView,
    detachSelfView: deps.detachSelfView,
    onParticipants: deps.onParticipants,
    onScreenShare: deps.onScreenShare,
  })

  const report = () =>
    deps.onStatus?.({ live: connected && !muted && !denied, muted, denied })

  // A meeting room is one whose key parses to the meeting kind (#486); the
  // prefix convention lives in schema.ts (#518), never spelled by hand here.
  const isMeetingRoom = (r: string | null) => r !== null && parseRoomKey(r).kind === 'meeting'

  // Fire onMeeting only on the edge: we hold a meeting room, or we don't.
  const reportMeeting = () => {
    const next = connected && isMeetingRoom(currentRoom)
    if (next !== inMeeting) {
      inMeeting = next
      deps.onMeeting?.(next)
    }
  }

  room.on(TRACK_SUBSCRIBED, (track, _pub, participant) => {
    const t = track as RemoteTrackLike
    if (t.kind === 'audio') {
      attach(t)
      report()
      return
    }
    if (isMeetingRoom(currentRoom)) meeting.trackSubscribed(t, participant as RemoteParticipantLike | undefined)
  })
  room.on(TRACK_UNSUBSCRIBED, (track, _pub, participant) => {
    const t = track as RemoteTrackLike
    detach(t)
    meeting.trackUnsubscribed(t, participant as RemoteParticipantLike | undefined)
  })
  room.on(PARTICIPANT_CONNECTED, (participant) => {
    if (isMeetingRoom(currentRoom)) meeting.participantConnected(participant as RemoteParticipantLike)
  })
  room.on(PARTICIPANT_DISCONNECTED, (participant) => {
    meeting.participantDisconnected(participant as RemoteParticipantLike)
  })
  room.on(LOCAL_TRACK_UNPUBLISHED, (pub) => meeting.localTrackUnpublished(pub as RemoteTrackLike))
  room.on(ACTIVE_SPEAKERS_CHANGED, (speakers) => {
    if (isMeetingRoom(currentRoom)) meeting.activeSpeakers(speakers as RemoteParticipantLike[])
  })

  // Fetch the room's token, connect, then publish the mic. A token/connect
  // failure just leaves voice off; only a declined mic reports `denied` (it
  // lights the mic-blocked indicator), so the two aren't conflated.
  async function connectTo(target: string) {
    if (joining) return
    joining = true
    currentRoom = target
    const t0 = now()
    try {
      await room.connect(url, await getToken(target))
      connected = true
      deps.onJoinLatency?.(now() - t0) // measured lead time (#310)
      report()
      reportMeeting() // opens the HUD the moment we hold a meeting room (#487)
      if (isMeetingRoom(currentRoom) && room.remoteParticipants) {
        meeting.seed(room.remoteParticipants.values()) // seed who's already here (#488)
      }
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
    meeting.reset() // stops the camera + share and forgets the tiles (#487/#488/#489)
    connected = false
    void room.disconnect()
    report()
    reportMeeting() // tears the HUD down when the meeting room is left (#487)
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

  // Which room do we *want* to be in right now? Inside a meeting zone → that
  // room, unconditionally (you are in the call the moment you step in, alone or
  // not, no POD_CAP). Outside → the proximity room, but only when a peer is in
  // earshot, with the three-radius hysteresis (#310): join on the pre-join band,
  // hold through the dead-band out to LEAVE_RADIUS, want-out beyond it.
  function desiredRoom(own: VoicePosition, roster: Map<string, VoicePosition>): string | null {
    const room = resolveRoom(own, zones, proximityRoom)
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
    // Publish/unpublish the camera (#487). Only meaningful inside a meeting room;
    // the meeting module lands a declined permission in a clean off state.
    async setCamera(on) {
      if (!connected || !isMeetingRoom(currentRoom)) return
      await meeting.setCamera(on)
    },
    // Share/stop sharing the screen (#489). Only meaningful inside a meeting room;
    // a dismissed picker is simply "not sharing", handled in the meeting module.
    async setScreenShare(on) {
      if (!connected || !isMeetingRoom(currentRoom)) return
      await meeting.setScreenShare(on)
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
// room key names which token to mint: a meeting room key asks Rails to authorize
// a meeting zone on this map (#486); anything else is the proximity room. Rails
// verifies the meeting is authored on a map the caller can reach — the browser
// never gets to name an arbitrary room.
async function fetchRoomToken(slug: string, authToken: string, key: string): Promise<string> {
  const ref = parseRoomKey(key)
  const meetingId = ref.kind === 'meeting' ? ref.roomId : null
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
// Returns null (voice cleanly off) when there is no LiveKit URL or no auth token.
// `ownId` is unused: LiveKit takes the participant identity from the server-minted
// token, not the client. `zones` are this map's authored zones (#486), passed as
// plain data. This is the ONLY place the meetingState singleton is bound (#524):
// the core reports through callbacks so it never writes the store itself.
export function connectLivekitRoom(
  slug: string,
  _ownId: string,
  zones: readonly Zone[] = [],
): VoiceHandle | null {
  const url = import.meta.env.VITE_LIVEKIT_URL as string | undefined
  const authToken = getAuthToken()
  if (!url || !authToken) return null

  const room = new Room()
  const mesh = createLivekitVoice({
    room,
    url,
    proximityRoom: roomKey({ kind: 'map', slug }),
    zones,
    getToken: (key) => fetchRoomToken(slug, authToken, key),
    // Flat MVP: attach every remote audio track at its default volume and let it
    // autoplay. Distance-scaled gain is a later slice (ADR-0011).
    attach: (track) => {
      const el = (track as RemoteTrack).attach()
      el.autoplay = true
      document.body.appendChild(el)
    },
    detach: (track) => (track as RemoteTrack).detach().forEach((el) => el.remove()),
    onStatus: (s) => micState.status(s),
    // Meeting HUD (#487): entering a meeting room opens the overlay and binds the
    // camera toggle to this mesh; leaving tears it down (the camera is already
    // stopped by the core). The camera state itself flows back through onCamera /
    // attachSelfView so the store never guesses what the device actually did.
    onMeeting: (inMeeting) =>
      inMeeting
        ? meetingState.enter(
            (on) => mesh.setCamera(on),
            (on) => void mesh.setScreenShare(on),
          )
        : meetingState.leave(),
    onCamera: (s) => meetingState.cameraStatus(s),
    attachSelfView: (track) => meetingState.setSelfView(track ?? null),
    detachSelfView: () => meetingState.setSelfView(null),
    // Remote faces in the meeting filmstrip (#488).
    onParticipants: (tiles) => meetingState.setParticipants(tiles),
    // The focused screen share (#489).
    onScreenShare: (s) => meetingState.setScreenShare(s),
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
    setCamera: mesh.setCamera,
    setScreenShare: mesh.setScreenShare,
    stop: () => {
      mesh.stop()
      micState.deactivate()
    },
  }
}
