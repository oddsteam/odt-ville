// The store behind the mic indicator + mute toggle (#282). Two behaviours are
// worth pinning: toggling reaches the live mesh's tracks, and the mute choice
// OUTLIVES a mesh — walk out of one pod/map and into another and you stay muted
// (criterion 4: pod changes must not silently unmute).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { micState } from './micState.ts'

// Module singleton — reset between cases so order doesn't leak state.
afterEach(() => micState.deactivate())

describe('micState', () => {
  it('hides (inactive) until a mesh activates it', () => {
    expect(micState.get().active).toBe(false)
    micState.activate(() => {})
    expect(micState.get().active).toBe(true)
  })

  it('toggles the mute flag and pushes it to the live mesh', () => {
    const setMute = vi.fn()
    micState.activate(setMute)
    expect(micState.get().muted).toBe(false)

    micState.toggle()
    expect(micState.get().muted).toBe(true)
    expect(setMute).toHaveBeenLastCalledWith(true)

    micState.toggle()
    expect(micState.get().muted).toBe(false)
    expect(setMute).toHaveBeenLastCalledWith(false)
  })

  it('keeps the mute choice when the mesh tears down and a new one comes up', () => {
    micState.activate(() => {})
    micState.toggle() // muted

    micState.deactivate() // left the map — voice off, but choice sticks
    expect(micState.get().active).toBe(false)
    expect(micState.get().muted).toBe(true)

    const nextMesh = vi.fn()
    micState.activate(nextMesh) // entered a new pod/map
    expect(micState.get().muted).toBe(true)
    expect(nextMesh).toHaveBeenCalledWith(true) // the fresh mesh starts muted
  })

  it('reflects the mesh status report', () => {
    micState.activate(() => {})
    micState.status({ live: true, muted: false, denied: false })
    expect(micState.get().live).toBe(true)
    micState.status({ live: false, muted: false, denied: true })
    expect(micState.get().denied).toBe(true)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = micState.subscribe(listener)
    micState.activate(() => {})
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    micState.toggle()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
