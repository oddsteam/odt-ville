// The pure state→display mapping behind the meeting HUD's camera control (#487)
// — the only bit worth a check; the React render around it is trivial (cf.
// micView). Pins the three states a player must tell apart: sharing video, off
// (both clickable), and permission-blocked (terminal, not clickable), exactly
// mirroring the mic-blocked state's shape.

import { describe, expect, it } from 'vitest'
import { cameraView } from './MeetingHud.tsx'

describe('cameraView', () => {
  it('shows an off state you can turn on', () => {
    const v = cameraView('off')
    expect(v.tone).toBe('off')
    expect(v.clickable).toBe(true)
  })

  it('shows a sharing state you can turn off', () => {
    const v = cameraView('on')
    expect(v.tone).toBe('on')
    expect(v.clickable).toBe(true)
  })

  it('shows a blocked, non-clickable state when permission was declined', () => {
    const v = cameraView('denied')
    expect(v.tone).toBe('denied')
    expect(v.clickable).toBe(false)
    expect(v.hint).toBeTruthy()
  })
})
