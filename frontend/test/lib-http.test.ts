import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Cause from 'effect/Cause'

import { HttpClientLive } from '../src/lib/http.ts'
import { Http, HttpError } from '../src/lib/http.ts'
import { setAuthToken } from '../src/lib/authToken.ts'

// Drain an Effect down to its Exit so we can inspect typed errors directly,
// regardless of which channel the failure lands in.
function runExit<A, E>(eff: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(eff)
}

// Build a fetch mock that yields one Response (or throws) per call, in order.
function mockFetch(...responses: Array<Response | Error>) {
  let i = 0
  const impl = async (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> => {
    const next = responses[i++]
    if (next instanceof Error) throw next
    return next as Response
  }
  return vi.fn(impl)
}

function provided<A, E>(eff: Effect.Effect<A, E, Http>) {
  return Effect.provide(eff, HttpClientLive)
}

describe('Http client', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => {
    // each test installs its own fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    setAuthToken(null)
  })

  it('attaches a Bearer token from the auth store when one is set', async () => {
    setAuthToken('jwt-abc')
    const f = mockFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    globalThis.fetch = f as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.get('/me')
    })
    await runExit(provided(program))

    const [, init] = f.mock.calls[0]!
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer jwt-abc')
  })

  it('omits the Authorization header when no token is set', async () => {
    setAuthToken(null)
    const f = mockFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    globalThis.fetch = f as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.get('/communities')
    })
    await runExit(provided(program))

    const [, init] = f.mock.calls[0]!
    const headers = new Headers(init?.headers)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('decodes a 2xx JSON body and returns it', async () => {
    globalThis.fetch = mockFetch(
      new Response(JSON.stringify({ hello: 'world' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.get('/things')
    })

    const exit = await runExit(provided(program))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ hello: 'world' })
    }
  })

  it('returns null for a 2xx empty body', async () => {
    globalThis.fetch = mockFetch(
      new Response(null, { status: 204 }),
    ) as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.del('/things/1')
    })

    const exit = await runExit(provided(program))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toBeNull()
    }
  })

  it('maps a 404 response to a typed RequestError', async () => {
    globalThis.fetch = mockFetch(
      new Response('not found', { status: 404 }),
    ) as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.get('/missing')
    })

    const exit = await runExit(provided(program))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      expect(fail._tag).toBe('Some')
      if (fail._tag === 'Some') {
        const e = fail.value as HttpError
        expect(e._tag).toBe('RequestError')
        if (e._tag === 'RequestError') {
          expect(e.status).toBe(404)
          expect(e.path).toBe('/missing')
          expect(e.body).toContain('not found')
        }
      }
    }
  })

  it('maps a 500 response to a typed RequestError', async () => {
    globalThis.fetch = mockFetch(
      new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.post('/things', { x: 1 })
    })

    const exit = await runExit(provided(program))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      if (fail._tag === 'Some') {
        const e = fail.value as HttpError
        expect(e._tag).toBe('RequestError')
        if (e._tag === 'RequestError') {
          expect(e.status).toBe(500)
        }
      }
    }
  })

  it('maps a thrown fetch (network failure) to a typed NetworkError', async () => {
    globalThis.fetch = mockFetch(new TypeError('failed to fetch')) as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.get('/anywhere')
    })

    const exit = await runExit(provided(program))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      if (fail._tag === 'Some') {
        const e = fail.value as HttpError
        expect(e._tag).toBe('NetworkError')
        if (e._tag === 'NetworkError') {
          expect(e.path).toBe('/anywhere')
        }
      }
    }
  })

  it('maps an unparseable JSON body to a typed DecodeError', async () => {
    globalThis.fetch = mockFetch(
      new Response('{not json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.get('/bad-json')
    })

    const exit = await runExit(provided(program))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      if (fail._tag === 'Some') {
        const e = fail.value as HttpError
        expect(e._tag).toBe('DecodeError')
        if (e._tag === 'DecodeError') {
          expect(e.path).toBe('/bad-json')
        }
      }
    }
  })

  it('prefixes paths with the /api base URL', async () => {
    const f = mockFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    globalThis.fetch = f as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.get('/communities')
    })
    await runExit(provided(program))

    expect(f).toHaveBeenCalledTimes(1)
    const firstCall = f.mock.calls[0]!
    expect(String(firstCall[0])).toBe('/api/v1/communities')
  })

  it('sends a PATCH with a JSON body to the prefixed path', async () => {
    const f = mockFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    globalThis.fetch = f as unknown as typeof fetch

    const program = Effect.gen(function* () {
      const http = yield* Http
      return yield* http.patch('/monsters/1', { encounter_rate: 4 })
    })
    const exit = await runExit(provided(program))
    expect(Exit.isSuccess(exit)).toBe(true)

    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toBe('/api/v1/monsters/1')
    expect(init?.method).toBe('PATCH')
    expect(init?.body).toBe(JSON.stringify({ encounter_rate: 4 }))
  })
})
