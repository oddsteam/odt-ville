import { describe, expect, it } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { Http, type HttpClient } from '../lib/http.ts'
import { list } from './service.ts'

// Capture the path the list read requests, so we can prove the hometown read
// (default) is scoped server-side while the admin CRUD list asks for all.
function capturingHttp(): { paths: string[]; layer: Layer.Layer<Http> } {
  const paths: string[] = []
  const client: HttpClient = {
    get: (path) => {
      paths.push(path)
      return Effect.succeed({ communities: [] } as never)
    },
    post: () => Effect.succeed(null as never),
    put: () => Effect.succeed(null as never),
    patch: () => Effect.succeed(null as never),
    del: () => Effect.succeed(null as never),
  }
  return { paths, layer: Layer.succeed(Http, client) }
}

describe('CommunitiesService.list', () => {
  it('requests the scoped hometown read by default', async () => {
    const { paths, layer } = capturingHttp()
    await Effect.runPromise(Effect.provide(list(), layer))
    expect(paths).toEqual(['/communities'])
  })

  it('requests the unfiltered list for the admin CRUD console', async () => {
    const { paths, layer } = capturingHttp()
    await Effect.runPromise(Effect.provide(list({ all: true }), layer))
    expect(paths).toEqual(['/communities?scope=all'])
  })
})
