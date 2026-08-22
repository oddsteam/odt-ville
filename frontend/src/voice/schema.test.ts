// The room-key convention has one home (#518): roomKey composes it, parseRoomKey
// reads it back. These pin the round-trip so a rename can't split the two sides.

import { describe, expect, it } from 'vitest'
import { parseRoomKey, roomKey, type RoomRef } from './schema.ts'

describe('roomKey / parseRoomKey (#518)', () => {
  it('composes a map proximity room and a meeting room', () => {
    expect(roomKey({ kind: 'map', slug: 'town' })).toBe('map-town')
    expect(roomKey({ kind: 'meeting', roomId: 'standup' })).toBe('meeting-standup')
  })

  it('round-trips both kinds', () => {
    const refs: RoomRef[] = [
      { kind: 'map', slug: 'town' },
      { kind: 'meeting', roomId: 'standup' },
    ]
    for (const ref of refs) expect(parseRoomKey(roomKey(ref))).toEqual(ref)
  })

  it('reads an unprefixed-looking slug back as a map room', () => {
    // Anything without the meeting prefix is the proximity room — the default.
    expect(parseRoomKey('map-plaza')).toEqual({ kind: 'map', slug: 'plaza' })
  })
})
