// The store behind the mic indicator + mute toggle (#282). Exactly one voice
// mesh is live at a time (voiceSession, #287), so a module singleton is the
// whole store — no context, no provider, useSyncExternalStore reads it straight.
//
// `muted` is the user's STANDING choice and outlives a mesh: deactivate() keeps
// it, so walking out of one pod/map and into another stays muted until you say
// otherwise (criterion 4 — a pod change must never silently unmute). The mesh
// applies it to track.enabled; this store just remembers it and pushes it in.

import type { MicStatus } from './schema.ts'

export interface MicSnapshot {
  active: boolean // a voice mesh is open (a multiplayer map) — else the UI hides
  live: boolean // mic granted, unmuted, ≥1 peer: you are actually being heard
  muted: boolean
  denied: boolean // the browser mic permission was declined
}

let snapshot: MicSnapshot = { active: false, live: false, muted: false, denied: false }
let apply: (muted: boolean) => void = () => {}
const listeners = new Set<() => void>()

const emit = (next: MicSnapshot) => {
  snapshot = next
  listeners.forEach((l) => l())
}

export const micState = {
  get: (): MicSnapshot => snapshot,

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },

  // A mesh comes up: bind how muting reaches its tracks, then push the standing
  // mute into the fresh mesh so a muted player stays muted across the hop.
  activate(setMute: (muted: boolean) => void): void {
    apply = setMute
    emit({ ...snapshot, active: true, live: false, denied: false })
    setMute(snapshot.muted)
  },

  // The mesh reports live/muted/denied as peers come and go and the mic resolves.
  status(s: MicStatus): void {
    emit({ ...snapshot, active: true, ...s })
  },

  // The one control the UI drives — flip the standing choice, push it to tracks.
  toggle(): void {
    const muted = !snapshot.muted
    emit({ ...snapshot, muted })
    apply(muted)
  },

  // The mesh tore down (left the map): voice off, but the mute choice sticks.
  deactivate(): void {
    apply = () => {}
    emit({ ...snapshot, active: false, live: false, denied: false })
  },
}
