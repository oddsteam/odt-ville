// MonstersService.pool — the wild-encounter pool read (#69), plus the optional
// named-pool filter (#87). Pins the request PATH the service builds so a named
// pool reaches the backend as `?pool=…` and an absent one stays today's
// unfiltered global pool, byte-for-byte.

import { describe, expect, it } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'

import { Http, type HttpError } from '../src/lib/http.ts'
import { MonstersService } from '../src/catalog/monsters/service.ts'

// Fake Http that records the GET path and returns an empty pool. The path is
// what we assert on; the decoded body just has to be a valid (empty) pool.
function recordingHttp(seen: string[]) {
  const get = (path: string): Effect.Effect<unknown, HttpError> => {
    seen.push(path)
    return Effect.succeed([])
  }
  const client = { get, post: get, put: get, patch: get, del: get }
  return Layer.succeed(Http, client as never)
}

const run = (name?: string, seen: string[] = []) =>
  Effect.runPromiseExit(Effect.provide(MonstersService.pool(name), recordingHttp(seen)))

describe('MonstersService.pool', () => {
  it('hits the unfiltered global pool when no name is given', async () => {
    const seen: string[] = []
    const exit = await run(undefined, seen)
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(seen).toEqual(['/monsters/pool'])
  })

  it('appends the named pool as a query param (#87)', async () => {
    const seen: string[] = []
    await run('cave', seen)
    expect(seen).toEqual(['/monsters/pool?pool=cave'])
  })

  it('url-encodes a pool name with special characters', async () => {
    const seen: string[] = []
    await run('plaza rares', seen)
    expect(seen).toEqual(['/monsters/pool?pool=plaza%20rares'])
  })
})
