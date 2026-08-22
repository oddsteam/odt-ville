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
import {
  meetingState,
  type CameraStatus,
  type RemoteTile,
  type ScreenShare,
  type SelfView,
} from './meetingState.ts'
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
// A camera publication carries the local video track (LocalVideoTrack) — enough
// of livekit's LocalTrackPublication to attach the self-view.
interface CameraPublicationLike {
  videoTrack?: SelfView
}

export interface RoomLike {
  on(event: string, cb: (...args: unknown[]) => void): unknown
  connect(url: string, token: string): Promise<void>
  disconnect(): Promise<void> | void
  localParticipant: {
    setMicrophoneEnabled(enabled: boolean): Promise<unknown>
    setCameraEnabled(enabled: boolean): Promise<CameraPublicationLike | undefined>
    setScreenShareEnabled(enabled: boolean): Promise<CameraPublicationLike | undefined>
  }
  // Participants already in the room at connect time (#488) — livekit populates
  // this before we get any participantConnected event. Absent in the mesh tests.
  remoteParticipants?: Map<string, RemoteParticipantLike>
}

interface RemoteTrackLike {
  kind: string
  source?: string // livekit Track.Source: 'camera' | 'screen_share' | ... (#489)
}

// The bit of a livekit RemoteParticipant the meeting tiles need (#488).
interface RemoteParticipantLike {
  identity: string
  name?: string
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
  // Meeting-room membership for the HUD (#487): true when we hold a meeting room,
  // false when we leave it. Drives whether the meeting overlay is shown.
  onMeeting?: (inMeeting: boolean) => void
  // The camera's real state as a toggle resolves (#487): 'denied' is a clean off
  // state (same shape as a declined mic), not an error.
  onCamera?: (s: CameraStatus) => void
  // Attach/detach the local camera track to the self-view tile (DOM lives in the
  // adapter, so the core stays testable in node — mirrors attach/detach above).
  attachSelfView?: (track: SelfView | undefined) => void
  detachSelfView?: () => void
  // The room's remote roster for the meeting filmstrip (#488), re-emitted whenever
  // a participant joins/leaves, publishes/stops video, or starts/stops speaking.
  onParticipants?: (tiles: RemoteTile[]) => void
  // The focused screen share (#489), re-emitted whenever a share starts or stops.
  onScreenShare?: (s: ScreenShare) => void
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
// Our own share sits in `shares` under this key, so "newest wins" covers it too.
const ME = 'me'

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
  // Meeting HUD state (#487). Camera membership is a click, never a default: it
  // publishes only inside a meeting room and stops the device on the way out.
  let inMeeting = false
  let cameraOn = false
  let cameraDenied = false
  let leaveTimer: ReturnType<typeof setTimeout> | null = null
  // The remote meeting roster (#488), keyed by identity: one tile per participant,
  // holding their video track (null = camera off → placeholder) and speaking flag.
  const tiles = new Map<string, { name: string; video: SelfView | null; speaking: boolean }>()
  // Live screen shares (#489), keyed by identity, in start order: the newest is
  // the focused surface, so two concurrent shares never fight — the later one wins
  // and the earlier one comes back when it stops.
  const shares = new Map<string, { name: string; video: SelfView }>()
  // The last position/roster, so a dwell timer firing later re-resolves against
  // where we actually are now, not where we were when it was armed.
  let lastOwn: VoicePosition = { x: 0, y: 0 }
  let lastRoster: Map<string, VoicePosition> = new Map()

  const report = () =>
    deps.onStatus?.({ live: connected && !muted && !denied, muted, denied })

  // A meeting room is one whose key we minted as `meeting-<roomId>` (#486).
  const isMeetingRoom = (r: string | null) => r !== null && r.startsWith('meeting-')

  // Fire onMeeting only on the edge: we hold a meeting room, or we don't.
  const reportMeeting = () => {
    const next = connected && isMeetingRoom(currentRoom)
    if (next !== inMeeting) {
      inMeeting = next
      deps.onMeeting?.(next)
    }
  }

  const reportCamera = () =>
    deps.onCamera?.(cameraDenied ? 'denied' : cameraOn ? 'on' : 'off')

  // Meeting filmstrip roster (#488). Tiles are only tracked inside a meeting room;
  // the proximity room is audio-only and hidden, so it never grows tiles.
  const syncTiles = () =>
    deps.onParticipants?.(
      [...tiles].map(([id, t]) => ({ id, name: t.name, video: t.video, speaking: t.speaking })),
    )
  const tileFor = (p: RemoteParticipantLike) => {
    let tile = tiles.get(p.identity)
    if (!tile) tiles.set(p.identity, (tile = { name: p.name || p.identity, video: null, speaking: false }))
    return tile
  }
  const clearTiles = () => {
    if (tiles.size === 0) return
    tiles.clear()
    syncTiles()
  }
  const syncShare = () => {
    const last = [...shares].at(-1)
    deps.onScreenShare?.({
      focused: last ? { id: last[0], ...last[1] } : null,
      mine: shares.has(ME),
    })
  }
  const dropShare = (id: string) => {
    if (shares.delete(id)) syncShare()
  }
  const isScreen = (t: RemoteTrackLike) => t.kind === 'video' && t.source === 'screen_share'

  // Stop publishing our screen — the in-app button, the browser's own "Stop
  // sharing" control, and walking out of the room all land here (#489).
  function stopShare() {
    if (!shares.has(ME)) return
    void room.localParticipant.setScreenShareEnabled(false).catch(() => {})
    dropShare(ME)
  }

  // Stop the camera device and drop the self-view — used both by the off toggle
  // and by leaving the room, so the light goes out either way (#487).
  function stopCamera() {
    if (!cameraOn && !cameraDenied) return
    cameraOn = false
    cameraDenied = false
    void room.localParticipant.setCameraEnabled(false).catch(() => {})
    deps.detachSelfView?.()
    reportCamera()
  }

  room.on(TRACK_SUBSCRIBED, (track, _pub, participant) => {
    const t = track as RemoteTrackLike
    if (t.kind === 'audio') {
      attach(t)
      report()
      return
    }
    if (t.kind !== 'video' || !participant || !isMeetingRoom(currentRoom)) return
    const p = participant as RemoteParticipantLike
    if (isScreen(t)) {
      tileFor(p) // a sharer still gets a face tile (placeholder when camera off)
      shares.set(p.identity, { name: p.name || p.identity, video: t as unknown as SelfView })
      syncTiles()
      syncShare()
      return
    }
    tileFor(p).video = t as unknown as SelfView
    syncTiles()
  })
  room.on(TRACK_UNSUBSCRIBED, (track, _pub, participant) => {
    const t = track as RemoteTrackLike
    detach(t)
    if (isScreen(t) && participant) {
      dropShare((participant as RemoteParticipantLike).identity)
      return
    }
    if (t.kind === 'video' && participant) {
      const tile = tiles.get((participant as RemoteParticipantLike).identity)
      if (tile) {
        tile.video = null // camera off → placeholder, but keep the tile
        syncTiles()
      }
    }
  })
  room.on(PARTICIPANT_CONNECTED, (participant) => {
    if (!isMeetingRoom(currentRoom)) return
    tileFor(participant as RemoteParticipantLike)
    syncTiles()
  })
  room.on(PARTICIPANT_DISCONNECTED, (participant) => {
    const id = (participant as RemoteParticipantLike).identity
    if (tiles.delete(id)) syncTiles()
    dropShare(id)
  })
  room.on(LOCAL_TRACK_UNPUBLISHED, (pub) => {
    if ((pub as RemoteTrackLike).source === 'screen_share') stopShare()
  })
  room.on(ACTIVE_SPEAKERS_CHANGED, (speakers) => {
    if (!isMeetingRoom(currentRoom)) return
    const talking = new Set((speakers as RemoteParticipantLike[]).map((s) => s.identity))
    for (const [id, tile] of tiles) tile.speaking = talking.has(id)
    syncTiles()
  })

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
      reportMeeting() // opens the HUD the moment we hold a meeting room (#487)
      if (isMeetingRoom(currentRoom) && room.remoteParticipants) {
        for (const p of room.remoteParticipants.values()) tileFor(p) // seed who's already here (#488)
        syncTiles()
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
    stopCamera() // leaving a room stops the camera device, even if the tab stays open (#487)
    stopShare() // and the screen share (#489)
    clearTiles() // and forgets everyone else's tiles (#488)
    if (shares.size) {
      shares.clear() // and any share we were watching (#489)
      syncShare()
    }
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
    // Publish/unpublish the camera (#487). Only meaningful inside a meeting room;
    // a declined permission lands in a clean off state (denied), never an error.
    async setCamera(on) {
      if (!connected || !isMeetingRoom(currentRoom)) return
      if (!on) {
        stopCamera()
        return
      }
      try {
        const pub = await room.localParticipant.setCameraEnabled(true)
        cameraOn = true
        cameraDenied = false
        deps.attachSelfView?.(pub?.videoTrack)
        reportCamera()
      } catch {
        cameraOn = false
        cameraDenied = true
        deps.detachSelfView?.()
        reportCamera()
      }
    },
    // Share/stop sharing the screen (#489). A dismissed picker rejects — that is
    // simply "not sharing", no denied state: the user can always try again.
    async setScreenShare(on) {
      if (!connected || !isMeetingRoom(currentRoom)) return
      if (!on) {
        stopShare()
        return
      }
      try {
        const pub = await room.localParticipant.setScreenShareEnabled(true)
        if (!pub?.videoTrack) return
        shares.set(ME, { name: 'You', video: pub.videoTrack })
        syncShare()
      } catch {
        /* picker dismissed or blocked — stay off */
      }
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
    // Meeting HUD (#487): entering a meeting room opens the overlay and binds the
    // camera toggle to this mesh; leaving tears it down (the camera is already
    // stopped by the core). The camera state itself flows back through onCamera /
    // attachSelfView so the store never guesses what the device actually did.
    onMeeting: (inMeeting) =>
      inMeeting
        ? meetingState.enter(
            (on) => mesh.setCamera?.(on),
            (on) => void mesh.setScreenShare?.(on),
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
    stop: () => {
      mesh.stop()
      micState.deactivate(mesh.setMute)
    },
  }
}
