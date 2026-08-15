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
  ItemStateResponse,
  type Community,
  type CommunityPatch,
  type FeedItem,
  type ItemStateResponse as ItemStateResponseType,
  type NewCommunity,
} from './schema.ts'

const decodeCommunities = Schema.decodeUnknown(CommunitiesResponse)
const decodeFeed = Schema.decodeUnknown(FeedResponse)
const decodeItemState = Schema.decodeUnknown(ItemStateResponse)

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

// PATCH /communities/:id -> the name, and the door Portal: gate (#38) +
// interior node (#113). Only the keys given are sent. Rails `update` answers
// PUT too, so reuse http.put — no new verb on the Http layer.
export const update = (
  id: number,
  patch: CommunityPatch,
): Effect.Effect<null, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.put(`/communities/${id}`, patch)
    return null
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

// POST /content_items/:id/open -> the partial state shape (not a FeedItem)
export const open = (
  id: number,
): Effect.Effect<ItemStateResponseType, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/content_items/${id}/open`
    const raw = yield* http.post(path)
    return yield* decode(path, decodeItemState)(raw)
  })

// POST /content_items/:id/acknowledge -> the partial state shape
export const acknowledge = (
  id: number,
): Effect.Effect<ItemStateResponseType, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/content_items/${id}/acknowledge`
    const raw = yield* http.post(path)
    return yield* decode(path, decodeItemState)(raw)
  })

export const CommunitiesService = {
  list,
  create,
  update,
  remove,
  getFeed,
  open,
  acknowledge,
} as const
