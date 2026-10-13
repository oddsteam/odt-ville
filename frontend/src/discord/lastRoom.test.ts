import { afterEach, describe, expect, it, vi } from 'vitest'
import { LAST_ROOM_SPAWN, spawnInLastRoom } from './lastRoom'
import { connectDiscordMeetings } from './meetingMove'
import { spawnTile } from '../game/phaser/mapWalk.ts'
import type { BakedMap, Zone } from '../kernel/schema.ts'

afterEach(() => vi.unstubAllGlobals())

const room = {
  x: 4,
  y: 6,
  w: 3,
  h: 2,
  trigger: 'on_enter',
  payload: { kind: 'meeting', roomId: 'meeting-1', label: 'Meeting Room' },
} as Zone
const map = { cols: 20, rows: 20, spawns: [{ id: 'door', x: 1, y: 1 }], zones: [room] } as unknown as BakedMap

describe('re-opening the Activity spawns you in your last room (#572)', () => {
  it('a last room naming a meeting zone here adds a spawn inside it', () => {
    const { map: out, entrySpawnId } = spawnInLastRoom(map, 'meeting-1')

    expect(entrySpawnId).toBe(LAST_ROOM_SPAWN)
    expect(out.spawns).toEqual([
      { id: 'door', x: 1, y: 1 },
      { id: LAST_ROOM_SPAWN, x: 5, y: 7 },
    ])
    expect(spawnTile(out, entrySpawnId)).toEqual({ x: 5, y: 7 })
  })

  it('no last room, or one this map has no meeting zone for, spawns as today', () => {
    for (const last of [null, 'elsewhere']) {
      expect(spawnInLastRoom(map, last)).toEqual({ map, entrySpawnId: undefined })
    }
  })

  it('spawning inside the room neither moves you again nor re-records it', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchFn)
    const onRoom = vi.fn(async () => {})
    const { map: out, entrySpawnId } = spawnInLastRoom(map, 'meeting-1')
    const voice = connectDiscordMeetings({ guildId: '1', zones: out.zones ?? [], notify: () => {}, onRoom })

    voice.update(spawnTile(out, entrySpawnId)) // MapScene's first update = the spawn
    voice.update({ x: 6, y: 6 }) // walking around inside
    await new Promise((r) => setTimeout(r))

    expect(fetchFn).not.toHaveBeenCalled()
    expect(onRoom).not.toHaveBeenCalled()
  })
})
