import { describe, expect, it } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Cause from 'effect/Cause'
import * as Layer from 'effect/Layer'

import { Http, RequestError, type HttpError } from '../src/lib/http.ts'
import { MapsService } from '../src/maps/service.ts'

const BAKED = {
  slug: 'atrium',
  title: 'The Atrium',
  cols: 1,
  rows: 1,
  tilesets: [{ name: '1_Terrains_and_Fences_32x32', cell: 32 }],
  tiles: [[{ tileset: '1_Terrains_and_Fences_32x32', frame: 0 }]],
  entities: [],
}

// Fake Http: route GETs by path. A value -> succeed; 'fail' -> a 404 (unknown
// slug surfaces as a RequestError, mirroring the Rails 404).
function fakeHttp(routes: Record<string, unknown>) {
  const get = (path: string): Effect.Effect<unknown, HttpError> => {
    const v = routes[path]
    if (v === undefined) return Effect.fail(new RequestError({ path, status: 404, body: 'no route' }))
    return v === 'fail'
      ? Effect.fail(new RequestError({ path, status: 404, body: 'Not found' }))
      : Effect.succeed(v)
  }
  const client = { get, post: get, put: get, patch: get, del: get }
  return Layer.succeed(Http, client as never)
}

const run = (slug: string, routes: Record<string, unknown>) =>
  Effect.runPromiseExit(Effect.provide(MapsService.get(slug), fakeHttp(routes)))

describe('MapsService.get', () => {
  it('loads and decodes the baked map for a known slug', async () => {
    const exit = await run('atrium', { '/maps/atrium': BAKED })
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.slug).toBe('atrium')
      expect(exit.value.tiles[0][0]).toEqual({ tileset: '1_Terrains_and_Fences_32x32', frame: 0 })
    }
  })

  it('surfaces a RequestError for an unknown slug (the Rails 404)', async () => {
    const exit = await run('nope', { '/maps/nope': 'fail' })
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      expect(fail._tag).toBe('Some')
      if (fail._tag === 'Some') expect(fail.value._tag).toBe('RequestError')
    }
  })
})
