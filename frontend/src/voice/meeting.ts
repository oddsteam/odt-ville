// The meeting call (#487/#488/#489): the local camera, screen share, and the
// remote filmstrip that exist only while you stand inside an authored meeting
// room (#486). livekit.ts owns the connection and the proximity hysteresis; it
// hands this module the room's local publisher and forwards the room events,
// and this module owns everything the meeting HUD shows.
//
// It reports out through plain callbacks and never imports the meetingState
// singleton (#524) — the browser adapter (connectLivekitRoom) is the only place
// that binds these callbacks to the store, so this stays testable in node and
// the store is written from exactly one place.

import type { CameraStatus, RemoteTile, ScreenShare, SelfView } from './meetingState.ts'

// Just enough of livekit-client to test the meeting wiring against a fake. A
// camera/share publication carries the local video track (LocalVideoTrack) — the
// self-view / focused-share surface; a remote track/participant is the bit the
// tiles read. livekit.ts re-uses these shims for its own casts.
export interface PublicationLike {
  videoTrack?: SelfView
}
export interface RemoteTrackLike {
  kind: string
  source?: string // livekit Track.Source: 'camera' | 'screen_share' | ... (#489)
}
export interface RemoteParticipantLike {
  identity: string
  name?: string
}

// The bit of livekit's LocalParticipant the meeting publishes through.
export interface LocalPublisher {
  setCameraEnabled(enabled: boolean): Promise<PublicationLike | undefined>
  setScreenShareEnabled(enabled: boolean): Promise<PublicationLike | undefined>
}

export interface MeetingDeps {
  local: LocalPublisher
  // The camera's real state as a toggle resolves (#487): 'denied' is a clean off
  // state (same shape as a declined mic), not an error.
  onCamera?: (s: CameraStatus) => void
  // Attach/detach the local camera track to the self-view tile (DOM lives in the
  // adapter, so the core stays testable in node).
  attachSelfView?: (track: SelfView | undefined) => void
  detachSelfView?: () => void
  // The room's remote roster for the filmstrip (#488), re-emitted whenever a
  // participant joins/leaves, publishes/stops video, or starts/stops speaking.
  onParticipants?: (tiles: RemoteTile[]) => void
  // The focused screen share (#489), re-emitted whenever a share starts or stops.
  onScreenShare?: (s: ScreenShare) => void
}

// Our own share sits in `shares` under this key, so "newest wins" covers it too.
const ME = 'me'

export interface Meeting {
  // Seed the tiles with whoever livekit already sees in the room at connect (#488).
  seed(participants: Iterable<RemoteParticipantLike>): void
  // A remote track (camera or screen) subscribed — audio is livekit's, not ours.
  trackSubscribed(track: RemoteTrackLike, participant?: RemoteParticipantLike): void
  trackUnsubscribed(track: RemoteTrackLike, participant?: RemoteParticipantLike): void
  participantConnected(participant: RemoteParticipantLike): void
  participantDisconnected(participant: RemoteParticipantLike): void
  activeSpeakers(speakers: RemoteParticipantLike[]): void
  // The browser's own "Stop sharing" control unpublishes our screen track (#489).
  localTrackUnpublished(pub: RemoteTrackLike): void
  setCamera(on: boolean): Promise<void>
  setScreenShare(on: boolean): Promise<void>
  // Leaving the meeting room: stop the local devices and forget everyone. The
  // light goes out even with the tab still open (#487). Idempotent.
  reset(): void
}

export function createMeeting(deps: MeetingDeps): Meeting {
  const { local } = deps
  // Camera membership is a click, never a default: it publishes only on a toggle
  // and stops the device on the way out (#487).
  let cameraOn = false
  let cameraDenied = false
  // The remote roster (#488), keyed by identity: one tile per participant, holding
  // their video track (null = camera off → placeholder) and speaking flag.
  const tiles = new Map<string, { name: string; video: SelfView | null; speaking: boolean }>()
  // Live screen shares (#489), keyed by identity, in start order: the newest is
  // the focused surface, so two concurrent shares never fight — the later one wins
  // and the earlier one comes back when it stops.
  const shares = new Map<string, { name: string; video: SelfView }>()

  const reportCamera = () =>
    deps.onCamera?.(cameraDenied ? 'denied' : cameraOn ? 'on' : 'off')

  const syncTiles = () =>
    deps.onParticipants?.(
      [...tiles].map(([id, t]) => ({ id, name: t.name, video: t.video, speaking: t.speaking })),
    )
  const tileFor = (p: RemoteParticipantLike) => {
    let tile = tiles.get(p.identity)
    if (!tile) tiles.set(p.identity, (tile = { name: p.name || p.identity, video: null, speaking: false }))
    return tile
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
    void local.setScreenShareEnabled(false).catch(() => {})
    dropShare(ME)
  }

  // Stop the camera device and drop the self-view — used both by the off toggle
  // and by leaving the room, so the light goes out either way (#487).
  function stopCamera() {
    if (!cameraOn && !cameraDenied) return
    cameraOn = false
    cameraDenied = false
    void local.setCameraEnabled(false).catch(() => {})
    deps.detachSelfView?.()
    reportCamera()
  }

  return {
    seed(participants) {
      for (const p of participants) tileFor(p)
      syncTiles()
    },
    trackSubscribed(t, participant) {
      if (t.kind !== 'video' || !participant) return
      if (isScreen(t)) {
        tileFor(participant) // a sharer still gets a face tile (placeholder when camera off)
        shares.set(participant.identity, { name: participant.name || participant.identity, video: t as unknown as SelfView })
        syncTiles()
        syncShare()
        return
      }
      tileFor(participant).video = t as unknown as SelfView
      syncTiles()
    },
    trackUnsubscribed(t, participant) {
      if (isScreen(t) && participant) {
        dropShare(participant.identity)
        return
      }
      if (t.kind === 'video' && participant) {
        const tile = tiles.get(participant.identity)
        if (tile) {
          tile.video = null // camera off → placeholder, but keep the tile
          syncTiles()
        }
      }
    },
    participantConnected(participant) {
      tileFor(participant)
      syncTiles()
    },
    participantDisconnected(participant) {
      if (tiles.delete(participant.identity)) syncTiles()
      dropShare(participant.identity)
    },
    activeSpeakers(speakers) {
      const talking = new Set(speakers.map((s) => s.identity))
      for (const [id, tile] of tiles) tile.speaking = talking.has(id)
      syncTiles()
    },
    localTrackUnpublished(pub) {
      if (pub.source === 'screen_share') stopShare()
    },
    async setCamera(on) {
      if (!on) {
        stopCamera()
        return
      }
      try {
        const pub = await local.setCameraEnabled(true)
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
    async setScreenShare(on) {
      if (!on) {
        stopShare()
        return
      }
      try {
        const pub = await local.setScreenShareEnabled(true)
        if (!pub?.videoTrack) return
        shares.set(ME, { name: 'You', video: pub.videoTrack })
        syncShare()
      } catch {
        /* picker dismissed or blocked — stay off */
      }
    },
    reset() {
      stopCamera() // leaving a room stops the camera device, even if the tab stays open (#487)
      stopShare() // and the screen share (#489)
      if (tiles.size) {
        tiles.clear() // and forgets everyone else's tiles (#488)
        syncTiles()
      }
      if (shares.size) {
        shares.clear() // and any share we were watching (#489)
        syncShare()
      }
    },
  }
}
