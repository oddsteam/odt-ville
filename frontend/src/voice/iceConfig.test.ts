import { describe, expect, it } from 'vitest'
import { iceConfig } from './iceConfig.ts'

describe('iceConfig (#283 TURN)', () => {
  it('degrades to no iceServers when TURN is unconfigured', () => {
    expect(iceConfig({})).toEqual({})
  })

  it('builds a TURN iceServer from url + credentials', () => {
    expect(
      iceConfig({
        VITE_TURN_URL: 'turn:turn.example.com:3478',
        VITE_TURN_USERNAME: 'u',
        VITE_TURN_CREDENTIAL: 'p',
      }),
    ).toEqual({
      iceServers: [
        { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' },
      ],
    })
  })
})
