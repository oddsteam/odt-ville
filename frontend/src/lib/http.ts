// Effect-based HTTP client for the frontend data/IO layer.
//
// DECISION (issue #5): we use a small custom fetch wrapper rather than
// @effect/platform's HttpClient. Reasons:
//   - smaller dependency surface for the tracer-bullet slice; the pattern is
//     visible in our own code, which makes the architecture gate easier to
//     review.
//   - @effect/platform brings runtime concepts (FetchHttpClient layer, Body,
//     HttpClientResponse, HttpClientError tag tree) we do not need yet —
//     no streaming, retries-with-backoff, or middleware in scope.
//   - the surface we need (get / post / del → Effect with three typed errors)
//     fits in ~50 lines; rolling our own keeps the boundary obvious and lets
//     callers compose decoders directly with Schema without bridging response
//     wrappers.
// If/when we want retries, instrumentation, or streaming bodies, swap this
// implementation for @effect/platform behind the same `Http` tag — no caller
// has to change.

import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Data from 'effect/Data'

const BASE = '/api/v1'

// Typed errors. Tagged Data classes give us `_tag` discrimination at no cost
// and `Equal` semantics for tests.

export class RequestError extends Data.TaggedError('RequestError')<{
  readonly path: string
  readonly status: number
  readonly body: string
}> {}

export class NetworkError extends Data.TaggedError('NetworkError')<{
  readonly path: string
  readonly reason: string
}> {}

export class DecodeError extends Data.TaggedError('DecodeError')<{
  readonly path: string
  readonly reason: string
}> {}

export type HttpError = RequestError | NetworkError | DecodeError

export interface HttpClient {
  readonly get: <A = unknown>(path: string) => Effect.Effect<A, HttpError>
  readonly post: <A = unknown>(
    path: string,
    body?: unknown,
  ) => Effect.Effect<A, HttpError>
  readonly put: <A = unknown>(
    path: string,
    body?: unknown,
  ) => Effect.Effect<A, HttpError>
  readonly patch: <A = unknown>(
    path: string,
    body?: unknown,
  ) => Effect.Effect<A, HttpError>
  readonly del: <A = unknown>(path: string) => Effect.Effect<A, HttpError>
}

export class Http extends Context.Tag('Http')<Http, HttpClient>() {}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

function readJson<A>(path: string, res: Response): Effect.Effect<A, HttpError> {
  return Effect.tryPromise({
    try: async () => {
      const text = await res.text()
      if (!text) return null as unknown as A
      return JSON.parse(text) as A
    },
    catch: (e) =>
      new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
  })
}

function send<A>(
  path: string,
  init: RequestInit,
): Effect.Effect<A, HttpError> {
  const url = `${BASE}${path}`
  return Effect.tryPromise({
    try: (signal) => fetch(url, { ...init, signal }),
    catch: (e) =>
      new NetworkError({ path, reason: e instanceof Error ? e.message : String(e) }),
  }).pipe(
    Effect.flatMap((res) => {
      if (!res.ok) {
        return Effect.flatMap(
          Effect.tryPromise({
            try: () => res.text(),
            catch: () => '',
          }).pipe(Effect.orElseSucceed(() => '')),
          (body) =>
            Effect.fail(new RequestError({ path, status: res.status, body })),
        )
      }
      return readJson<A>(path, res)
    }),
  )
}

const live: HttpClient = {
  get: (path) => send(path, { method: 'GET' }),
  post: (path, body) =>
    send(path, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: (path, body) =>
    send(path, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: (path, body) =>
    send(path, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  del: (path) => send(path, { method: 'DELETE' }),
}

export const HttpClientLive = Layer.succeed(Http, live)
