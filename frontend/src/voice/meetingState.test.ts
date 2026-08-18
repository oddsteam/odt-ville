// The store behind the meeting HUD (#487). It mirrors micState (#282): a module
// singleton is the whole store, read straight by useSyncExternalStore. Two
// behaviours are worth pinning — the HUD shows only while you stand in a meeting
// room, and the camera is OFF on entry every time (nobody broadcasts video
// without a deliberate click, even after turning it on in the last room).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { meetingState, type SelfView } from './meetingState.ts'

// Module singleton — reset between cases so order doesn't leak state.
afterEach(() => meetingState.leave())

describe('meetingState', () => {
  it('is hidden until you enter a meeting room, and hidden again on leave', () => {
    expect(meetingState.get().inRoom).toBe(false)
    meetingState.enter(() => {})
    expect(meetingState.get().inRoom).toBe(true)
    meetingState.leave()
    expect(meetingState.get().inRoom).toBe(false)
  })

  it('starts every room with the camera off — no publish without a click', () => {
    meetingState.enter(() => {})
    expect(meetingState.get().camera).toBe('off')
  })

  it('re-entering starts off even after turning the camera on last room', () => {
    meetingState.enter(() => {})
    meetingState.toggleCamera()
    meetingState.cameraStatus('on') // the mesh confirms it published
    expect(meetingState.get().camera).toBe('on')

    meetingState.leave()
    meetingState.enter(() => {})
    expect(meetingState.get().camera).toBe('off')
  })

  it('toggling drives the bound camera control on, then off', () => {
    const calls: boolean[] = []
    meetingState.enter((on) => calls.push(on))
    meetingState.toggleCamera()
    meetingState.cameraStatus('on')
    meetingState.toggleCamera()
    expect(calls).toEqual([true, false])
  })

  it('reports a denied camera as a clean off state, not an error', () => {
    meetingState.enter(() => {})
    meetingState.cameraStatus('denied')
    expect(meetingState.get().camera).toBe('denied')
  })

  it('holds the self-view track while on and drops it on leave', () => {
    const track = {} as SelfView
    meetingState.enter(() => {})
    meetingState.setSelfView(track)
    expect(meetingState.get().selfView).toBe(track)
    meetingState.leave()
    expect(meetingState.get().selfView).toBe(null)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = meetingState.subscribe(listener)
    meetingState.enter(() => {})
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    meetingState.toggleCamera()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
