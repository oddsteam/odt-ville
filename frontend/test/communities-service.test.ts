import { describe, expect, it } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Cause from 'effect/Cause'
import * as Layer from 'effect/Layer'

import { Http, RequestError, DecodeError, type HttpError } from '../src/lib/http.ts'
import { CommunitiesService } from '../src/communities/service.ts'

// Fake Http: POSTs echo a routed body. 'fail' -> the Rails 404; anything else
// succeeds. Mirrors content_items_controller's state_json response.
function fakeHttp(routes: Record<string, unknown>) {
  const post = (path: string): Effect.Effect<unknown, HttpError> => {
    const v = routes[path]
    if (v === undefined) return Effect.fail(new RequestError({ path, status: 404, body: 'no route' }))
    return v === 'fail'
      ? Effect.fail(new RequestError({ path, status: 404, body: 'Not found' }))
      : Effect.succeed(v)
  }
  const client = { get: post, post, put: post, patch: post, del: post }
  return Layer.succeed(Http, client as never)
}

const OPENED = { id: 7, state: 'opened', opened_at: '2026-07-13T00:00:00Z', acknowledged_at: null }
const ACKED = { id: 7, state: 'acknowledged', opened_at: '2026-07-13T00:00:00Z', acknowledged_at: '2026-07-13T00:01:00Z' }

describe('CommunitiesService.open', () => {
  it('posts to /content_items/:id/open and decodes the state shape', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(CommunitiesService.open(7), fakeHttp({ '/content_items/7/open': OPENED })),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) expect(exit.value).toEqual(OPENED)
  })

  it('surfaces a RequestError for an item from another company (the Rails 404)', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(CommunitiesService.open(7), fakeHttp({ '/content_items/7/open': 'fail' })),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      if (fail._tag === 'Some') expect(fail.value._tag).toBe('RequestError')
    }
  })

  it('surfaces a DecodeError when the state field is not a known literal', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        CommunitiesService.open(7),
        fakeHttp({ '/content_items/7/open': { ...OPENED, state: 'bogus' } }),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      if (fail._tag === 'Some') expect(fail.value).toBeInstanceOf(DecodeError)
    }
  })
})

describe('CommunitiesService.update', () => {
  it('sends only the keys given, so a rename leaves the door alone', async () => {
    const sent: Array<{ path: string; body: unknown }> = []
    const record = (path: string, body?: unknown) => {
      sent.push({ path, body })
      return Effect.succeed(null)
    }
    const layer = Layer.succeed(Http, { get: record, post: record, put: record, patch: record, del: record } as never)

    await Effect.runPromise(Effect.provide(CommunitiesService.update(3, { title: 'Finance House' }), layer))

    expect(sent).toEqual([{ path: '/communities/3', body: { title: 'Finance House' } }])
  })
})

describe('CommunitiesService.acknowledge', () => {
  it('posts to /content_items/:id/acknowledge and decodes the state shape', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(CommunitiesService.acknowledge(7), fakeHttp({ '/content_items/7/acknowledge': ACKED })),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) expect(exit.value).toEqual(ACKED)
  })
})
