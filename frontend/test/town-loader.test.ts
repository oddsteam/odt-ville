import { describe, expect, it, vi } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Cause from 'effect/Cause'
import * as Layer from 'effect/Layer'

import { Http, RequestError, type HttpError } from '../src/lib/http.ts'

// The character branch keeps loadMyManifest's own resolution chain (for_me
// -> committed default), which bypasses the injected Http layer.
// Stub it so these tests exercise only the Effect.all orchestration.
vi.mock('../src/character/manifest.js', () => ({
  loadMyManifest: vi.fn(async () => ({ name: 'scout' })),
}))

import { loadTown } from '../src/townLoader.ts'

const SESSION = {
  last_area: 'town',
  last_community_id: null,
  last_room: null,
  spawn: { area: 'town', last_community_id: null },
}

// Fake Http: route GETs by path prefix. A value -> succeed; 'fail' -> a 500.
function fakeHttp(routes: Record<string, unknown>) {
  const get = (path: string): Effect.Effect<unknown, HttpError> => {
    for (const prefix of Object.keys(routes)) {
      if (path.startsWith(prefix)) {
        const v = routes[prefix]
        return v === 'fail'
          ? Effect.fail(new RequestError({ path, status: 500, body: 'boom' }))
          : Effect.succeed(v)
      }
    }
    return Effect.fail(new RequestError({ path, status: 404, body: 'no route' }))
  }
  const client = { get, post: get, put: get, del: get }
  return Layer.succeed(Http, client as never)
}

const POOL = [{ id: 1, name: 'Slime', encounter_dialog: 'A wild Slime appears!', encounter_rate: 3, image: 'data:slime' }]

const OK_ROUTES = {
  '/communities': { communities: [] },
  '/game/session': SESSION,
  '/content_items/feed': { items: [] },
  '/tile_objects/active': 'fail',
  '/ground_tiles': 'fail',
  '/monsters/pool': POOL,
}

const run = (routes: Record<string, unknown>) =>
  Effect.runPromiseExit(Effect.provide(loadTown(), fakeHttp(routes)))

describe('loadTown orchestration', () => {
  it('falls optionals back (null / []) and still renders when required succeed', async () => {
    const exit = await run(OK_ROUTES)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.communities).toEqual([])
      expect(exit.value.session).toEqual(SESSION)
      expect(exit.value.feed).toEqual([])
      expect(exit.value.policy).toEqual({ tree: null, flowerGroup: null, flowerSingle: null })
      expect(exit.value.groundTiles).toEqual([])
      expect(exit.value.characterManifest).toEqual({ name: 'scout' })
      expect(exit.value.monsterPool).toEqual(POOL)
    }
  })

  it('falls the monster pool back to [] when its endpoint errors', async () => {
    const exit = await run({ ...OK_ROUTES, '/monsters/pool': 'fail' })
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) expect(exit.value.monsterPool).toEqual([])
  })

  it('surfaces a required-resource failure as an error', async () => {
    const exit = await run({ ...OK_ROUTES, '/communities': 'fail' })
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      expect(fail._tag).toBe('Some')
      if (fail._tag === 'Some') expect(fail.value._tag).toBe('RequestError')
    }
  })
})
