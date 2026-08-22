import { describe, it, expect } from 'vitest'
import { connectVoice } from '../src/voice/write.ts'
import { setAuthToken } from '../src/lib/authToken.ts'

// connectVoice is voice's public write surface (#522), a thin wrapper over the
// LiveKit room (the peer mesh was removed in #517, ADR-0011). Its shell contract:
// with no auth token there is no room to join, so voice is cleanly off (null),
// never a crash. The LiveKit join/mute/stop wiring is covered in livekit.test.ts.
describe('connectVoice', () => {
  it('does not open without an auth token', () => {
    setAuthToken(null)
    expect(connectVoice('plaza', 'me')).toBeNull()
  })
})
