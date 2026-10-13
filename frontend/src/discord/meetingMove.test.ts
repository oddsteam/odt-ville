import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAuthToken } from '../lib/authToken'
import { connectDiscordMeetings, MOVING_NOTICE, NO_CHANNEL_NOTICE } from './meetingMove'
import type { Zone } from '../kernel/schema.ts'

afterEach(() => setAuthToken(null))

const room: Zone = {
  x: 2,
  y: 2,
  w: 2,
  h: 2,
  trigger: 'on_enter',
  payload: { kind: 'meeting', roomId: 'meeting-1', label: 'Meeting Room' },
}
const portal = { ...room, x: 6, payload: { kind: 'portal' } } as unknown as Zone
const unlabelled = { ...room, x: 8, payload: { kind: 'meeting', roomId: 'Lounge' } } as unknown as Zone
const zones = [room, portal, unlabelled]

function setup(response: () => Response = () => new Response(null, { status: 204 })) {
  const fetchFn = vi.fn(async () => response())
  const notify = vi.fn()
  const handle = connectDiscordMeetings({ guildId: '111', zones, notify, fetchFn })
  const step = (x: number, y: number) => handle.update({ x, y })
  const flush = () => new Promise((r) => setTimeout(r))
  const bodies = () =>
    fetchFn.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string))
  return { fetchFn, notify, step, flush, bodies }
}

describe('walking into a meeting room moves you to its voice channel (#571)', () => {
  it('entering a meeting zone posts one move, signed in, after the HUD notice', async () => {
    setAuthToken('dsc.abc')
    const { fetchFn, notify, step, bodies } = setup()

    step(0, 0) // spawn
    step(2, 2) // enter
    step(3, 3) // walk around inside
    step(2, 3)

    expect(bodies()).toEqual([{ guild_id: '111', room: 'Meeting Room' }])
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/discord/move')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer dsc.abc')
    expect(notify).toHaveBeenCalledWith(MOVING_NOTICE)
  })

  it('peer frames re-sending the same tile never re-move', () => {
    const { fetchFn, step } = setup()
    step(0, 0)
    step(2, 2)
    for (let i = 0; i < 5; i++) step(2, 2)

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('spawning inside a room does not move (you are already in its channel)', () => {
    const { fetchFn, step } = setup()
    step(2, 2) // spawn inside (#572)
    step(3, 3)

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('leaving and re-entering moves again; leaving alone does not', () => {
    const { bodies, step } = setup()
    step(0, 0)
    step(2, 2)
    step(0, 0)
    expect(bodies()).toHaveLength(1)
    step(2, 2)
    expect(bodies()).toHaveLength(2)
  })

  it('a non-meeting zone never moves; an unlabelled room matches by roomId', () => {
    const { bodies, step } = setup()
    step(0, 0)
    step(6, 2) // portal
    step(8, 2) // meeting without a label
    expect(bodies()).toEqual([{ guild_id: '111', room: 'Lounge' }])
  })

  it('a room with no voice channel says so', async () => {
    const { notify, step, flush } = setup(() => Response.json({ error: 'no_voice_channel' }, { status: 404 }))
    step(0, 0)
    step(2, 2)
    await flush()

    expect(notify).toHaveBeenLastCalledWith(NO_CHANNEL_NOTICE)
  })

  it('stepping out of the room clears the notice', () => {
    const { notify, step } = setup()
    step(0, 0)
    step(2, 2)
    step(0, 0)
    expect(notify).toHaveBeenLastCalledWith(null)
  })
})
