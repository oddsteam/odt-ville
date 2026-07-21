// The pure state→display mapping behind the mic indicator (#282) — the only bit
// worth a check; the React render around it is trivial (cf. VoiceMeters' level).
// Pins the four states a player must be able to tell apart: transmitting, muted,
// mic-on-but-alone, and permission-blocked (the last is not clickable).

import { describe, expect, it } from 'vitest'
import { micView } from './MicIndicator.tsx'

const snap = (o: Partial<Parameters<typeof micView>[0]> = {}) => ({
  active: true,
  live: false,
  muted: false,
  denied: false,
  ...o,
})

describe('micView', () => {
  it('shows a live/transmitting state you can mute', () => {
    const v = micView(snap({ live: true }))
    expect(v.tone).toBe('live')
    expect(v.clickable).toBe(true)
  })

  it('shows a muted state you can unmute', () => {
    const v = micView(snap({ muted: true }))
    expect(v.tone).toBe('muted')
    expect(v.clickable).toBe(true)
  })

  it('shows mic-on-but-nobody-nearby distinctly from live', () => {
    expect(micView(snap()).tone).toBe('idle')
  })

  it('shows a blocked, non-clickable state when permission was declined', () => {
    const v = micView(snap({ denied: true }))
    expect(v.tone).toBe('denied')
    expect(v.clickable).toBe(false)
  })

  it('muted wins over live — a muted player is never shown transmitting', () => {
    expect(micView(snap({ live: true, muted: true })).tone).toBe('muted')
  })
})
