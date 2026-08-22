import { describe, it, expect } from 'vitest'
import { connectVoice } from '../src/voice/mesh.ts'
import { setAuthToken } from '../src/lib/authToken.ts'

// The peer mesh transport was removed (#517, ADR-0011) — connectVoice is now a
// thin alias of the LiveKit room. Its shell contract survives the rewrite: with
// no auth token there is no room to join, so voice is cleanly off (null), never
// a crash. The LiveKit join/mute/stop wiring is covered in livekit.test.ts.
describe('connectVoice', () => {
  it('does not open without an auth token', () => {
    setAuthToken(null)
    expect(connectVoice('plaza', 'me')).toBeNull()
  })
})
