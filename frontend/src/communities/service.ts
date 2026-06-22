// Effect-based communities resource service. Every method returns a typed
// Effect over the data-layer errors (RequestError | NetworkError | DecodeError)
// — callers `runEdge(...)` them at the React boundary. No React, no DOM,
// nothing that prevents this module from being driven from tests or future
// non-React UIs.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import {
  CommunitiesResponse,
  FeedResponse,
  type Community,
  type FeedItem,
  type NewCommunity,
} from './schema.ts'

const decodeCommunities = Schema.decodeUnknown(CommunitiesResponse)
const decodeFeed = Schema.decodeUnknown(FeedResponse)

function decode<A>(
  path: string,
  decoder: (u: unknown) => Effect.Effect<A, unknown>,
) {
  return (raw: unknown) =>
    Effect.mapError(
      decoder(raw),
      (e) =>
        new DecodeError({
          path,
          reason: e instanceof Error ? e.message : String(e),
        }),
    )
}

// GET /communities -> Community[]
export const list = (): Effect.Effect<readonly Community[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.get('/communities')
    const payload = yield* decode('/communities', decodeCommunities)(raw)
    return payload.communities
  })

// POST /communities -> created community summary
export const create = (
  attrs: NewCommunity,
): Effect.Effect<unknown, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    return yield* http.post('/communities', attrs)
  })

// DELETE /communities/:id -> null
export const remove = (id: number): Effect.Effect<null, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.del(`/communities/${id}`)
    return null
  })

// GET /content_items/feed -> FeedItem[]
export const getFeed = (): Effect.Effect<readonly FeedItem[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.get('/content_items/feed')
    const payload = yield* decode('/content_items/feed', decodeFeed)(raw)
    return payload.items
  })

export const CommunitiesService = { list, create, remove, getFeed } as const
