import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setAuthToken } from '../src/lib/authToken.ts'

// Drive the client without a real socket: capture the action it performs and
// the `received` callback it registers, so the test can push inbound frames.
const perform = vi.fn()
let received: (frame: unknown) => void = () => {}
const disconnect = vi.fn()

vi.mock('@rails/actioncable', () => ({
  createConsumer: () => ({
    subscriptions: {
      create: (_params: unknown, mixin: { received: (f: unknown) => void }) => {
        received = mixin.received
        return { perform }
      },
    },
    disconnect,
  }),
}))

import { connectSignalling } from '../src/voice/write.ts'

describe('connectSignalling', () => {
  beforeEach(() => {
    perform.mockClear()
    setAuthToken('a-token')
  })

  it('does not connect without an auth token', () => {
    setAuthToken(null)
    expect(connectSignalling('plaza')).toBeNull()
  })

  it('sends a signal as a PresenceChannel action carrying the target and opaque blob', () => {
    const handle = connectSignalling('plaza')!

    handle.send('peer-id', { sdp: 'offer' })

    // We address the target and hand over the payload; `from` is the server's
    // to stamp, never ours.
    expect(perform).toHaveBeenCalledWith('signal', {
      to: 'peer-id',
      payload: { sdp: 'offer' },
    })
  })

  it('delivers inbound signal frames to the handler', () => {
    const handle = connectSignalling('plaza')!
    const seen: unknown[] = []
    handle.onSignal((m) => seen.push(m))

    const message = { type: 'signal', from: 'peer-id', payload: { sdp: 'answer' } }
    received(message)

    expect(seen).toEqual([message])
  })

  it('ignores non-signal frames — the channel is shared with presence', () => {
    const handle = connectSignalling('plaza')!
    const seen: unknown[] = []
    handle.onSignal((m) => seen.push(m))

    received({ type: 'move', userId: 'peer-id', x: 1, y: 2 })

    expect(seen).toEqual([])
  })
})
