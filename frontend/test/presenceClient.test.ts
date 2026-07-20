import { describe, expect, it, beforeEach, vi } from 'vitest'

// The wire half of presence (#88). ActionCable silently drops a `perform()`
// issued before the subscription confirms — and MapScene announces its spawn
// in create(), which is almost always too early. The client therefore replays
// the latest announce on `connected`, so arriving in a room populates it
// without waiting for the first step (#266).

let received: (frame: unknown) => void
let connected: () => void
const performed: unknown[][] = []

vi.mock('@rails/actioncable', () => ({
  createConsumer: () => ({
    subscriptions: {
      create: (_params: unknown, handlers: Record<string, () => void>) => {
        received = handlers.received as typeof received
        connected = handlers.connected
        return { perform: (...args: unknown[]) => performed.push(args) }
      },
    },
    disconnect: () => {},
  }),
}))
vi.mock('../src/lib/authToken.ts', () => ({ getAuthToken: () => 'test-token' }))

const { connectPresence } = await import('../src/lib/presenceClient.ts')

describe('connectPresence', () => {
  beforeEach(() => {
    performed.length = 0
  })

  it('replays the latest announce once the room confirms', () => {
    const handle = connectPresence('plaza')!

    // Announced from create(), before the subscription is live — dropped.
    handle.send({ x: 1, y: 2, facing: 'down' })
    connected()

    expect(performed).toEqual([
      ['move', { x: 1, y: 2, facing: 'down' }],
      ['move', { x: 1, y: 2, facing: 'down' }],
    ])
  })

  it('replays only the latest position, not the whole walk', () => {
    const handle = connectPresence('plaza')!

    handle.send({ x: 1, y: 2, facing: 'down' })
    handle.send({ x: 3, y: 4, facing: 'left' })
    connected()

    expect(performed.at(-1)).toEqual(['move', { x: 3, y: 4, facing: 'left' }])
    expect(performed).toHaveLength(3)
  })

  it('replays nothing when the scene never announced', () => {
    connectPresence('plaza')

    connected()

    expect(performed).toEqual([])
  })

  it('still forwards received frames to the scene handler', () => {
    const handle = connectPresence('plaza')
    const seen: unknown[] = []
    handle!.onFrame((f) => seen.push(f))

    received({ type: 'move' })

    expect(seen).toEqual([{ type: 'move' }])
  })
})
