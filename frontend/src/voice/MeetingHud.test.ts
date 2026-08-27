// The pure state→display mapping behind the meeting HUD's camera control (#487)
// — the only bit worth a check; the React render around it is trivial (cf.
// micView). Pins the three states a player must tell apart: sharing video, off
// (both clickable), and permission-blocked (terminal, not clickable), exactly
// mirroring the mic-blocked state's shape.

import { describe, expect, it } from 'vitest'
import { cameraView, shareView, surfaceView, tileView } from './MeetingHud.tsx'
import type { RemoteTile, ShareTile } from './meetingState.ts'

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

describe('tileView (#488)', () => {
  const tile = (over: Partial<RemoteTile>): RemoteTile => ({
    id: 'x',
    name: 'Alice',
    video: null,
    speaking: false,
    ...over,
  })

  it('renders live video when the participant has a camera track', () => {
    expect(tileView(tile({ video: {} as RemoteTile['video'] })).showVideo).toBe(true)
  })

  it('falls back to a name initial placeholder when the camera is off', () => {
    const v = tileView(tile({ name: 'bob', video: null }))
    expect(v.showVideo).toBe(false)
    expect(v.initial).toBe('B')
  })

  it('rings the tile of the active speaker', () => {
    expect(tileView(tile({ speaking: true })).ring).toBe(true)
    expect(tileView(tile({ speaking: false })).ring).toBe(false)
  })

  it('uses a fallback glyph when the name is blank', () => {
    expect(tileView(tile({ name: '   ' })).initial).toBe('?')
  })
})

describe('surfaceView', () => {
  it('shrinks to a thumbnail so the player can see the game and walk away', () => {
    const v = surfaceView(true)
    expect(v.width).toBe('240px')
    expect(v.toggleTitle).toMatch(/expand/i)
  })

  it('is large by default so a shared screen stays legible', () => {
    const v = surfaceView(false)
    expect(v.width).toBe('min(960px, 90vw)')
    expect(v.toggleTitle).toMatch(/shrink/i)
  })
})

describe('shareView (#489)', () => {
  const tile: ShareTile = { id: 'alice', name: 'Alice', video: {} as ShareTile['video'] }

  it('offers to share while nobody is, and to stop while I am', () => {
    expect(shareView({ focused: null, mine: false }).label).toBe('Share screen')
    expect(shareView({ focused: { ...tile, id: 'me' }, mine: true }).label).toBe('Stop sharing')
  })

  it('captions the focused surface by its sharer', () => {
    expect(shareView({ focused: tile, mine: false }).caption).toBe("Alice's screen")
    expect(shareView({ focused: { ...tile, id: 'me' }, mine: true }).caption).toBe('Your screen')
    expect(shareView({ focused: null, mine: false }).caption).toBe(null)
  })
})
