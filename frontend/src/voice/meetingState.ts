// The store behind the meeting HUD (#487). Standing inside a meeting room opens
// a LiveKit call (#486); this store is what the HUD reads to know it should show
// and what the mic/camera controls drive. It mirrors micState (#282): exactly
// one voice mesh is live at a time (#287), so a module singleton is the whole
// store — no context, no provider, useSyncExternalStore reads it straight.
//
// The camera is deliberately NOT a session-surviving choice the way the mic mute
// is: it is OFF on every entry, because membership is automatic (#486) and a
// camera that remembered "on" would broadcast someone's face the moment they
// wandered into a room. Publishing video is always a click, never a default.

export type CameraStatus = 'off' | 'on' | 'denied'

// The local camera track rendered in the self-view tile. Structural on purpose —
// livekit's LocalVideoTrack satisfies attach/detach, so this store never imports
// the client (voice stays independently extractable).
export interface SelfView {
  attach(el: HTMLVideoElement): unknown
  detach(): unknown
}

export interface MeetingSnapshot {
  inRoom: boolean // standing in a meeting room — the HUD shows, else it hides
  camera: CameraStatus
  selfView: SelfView | null // the local camera track to render while on
}

let snapshot: MeetingSnapshot = { inRoom: false, camera: 'off', selfView: null }
let apply: (on: boolean) => void = () => {}
const listeners = new Set<() => void>()

const emit = (next: MeetingSnapshot) => {
  snapshot = next
  listeners.forEach((l) => l())
}

export const meetingState = {
  get: (): MeetingSnapshot => snapshot,

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },

  // Walked into a meeting room: show the HUD and bind the camera control. The
  // camera starts OFF every time — the standing mute choice survives (micState),
  // the camera never does.
  enter(setCamera: (on: boolean) => void): void {
    apply = setCamera
    emit({ inRoom: true, camera: 'off', selfView: null })
  },

  // The one camera control the HUD drives: off→on publishes, on→off stops the
  // device. The mesh reports the real result back via cameraStatus()/setSelfView().
  toggleCamera(): void {
    apply(snapshot.camera !== 'on')
  },

  // The mesh reports the camera's real state as the publish resolves. 'denied' is
  // a clean off state (same shape as MicStatus.denied), not an error.
  cameraStatus(camera: CameraStatus): void {
    emit({ ...snapshot, camera })
  },

  // The mesh hands over the local camera track for the self-view tile, or drops it.
  setSelfView(track: SelfView | null): void {
    emit({ ...snapshot, selfView: track })
  },

  // Walked out: tear the HUD down. The mesh has already stopped the camera device
  // (the light goes out); the store just forgets everything and defaults back off.
  leave(): void {
    apply = () => {}
    emit({ inRoom: false, camera: 'off', selfView: null })
  },
}
