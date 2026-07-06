// Effect-based tile-object resource service. Methods return typed Effects over
// the data-layer errors (RequestError | NetworkError | DecodeError) — callers
// `runEdge(...)` them at the React boundary. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { TileObject, TileObjectSummary, type NewTileObject } from './schema.ts'

const decodeWith =
  <A>(schema: Schema.Schema<A>) =>
  (path: string) =>
  (raw: unknown) =>
    Effect.mapError(Schema.decodeUnknown(schema)(raw), (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }))

const decode = decodeWith(TileObject)
const decodeMany = decodeWith(Schema.Array(TileObject))
const decodeSummary = decodeWith(TileObjectSummary)
const decodeSummaries = decodeWith(Schema.Array(TileObjectSummary))

// GET /tile_objects/active?kind= -> the live object, or null (204) when none.
export const getActive = (
  kind = 'tree',
): Effect.Effect<TileObject | null, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/tile_objects/active?kind=${encodeURIComponent(kind)}`
    const raw = yield* http.get(path)
    return raw === null ? null : yield* decode(path)(raw)
  })

// GET /tile_objects/:id -> the full object incl. image, for loading a saved
// object back into the mapper to add/adjust its door anchor or walk mask.
export const get = (
  id: number,
): Effect.Effect<TileObject, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/tile_objects/${id}`
    const raw = yield* http.get(path)
    return yield* decode(path)(raw)
  })

// POST /tile_objects -> the saved object, made the live object of its kind.
export const save = (
  body: NewTileObject,
): Effect.Effect<TileObject, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.post('/tile_objects', { ...body, active: true })
    return yield* decode('/tile_objects')(raw)
  })

// GET /tile_objects?ids=1,2,3 -> the full objects (incl. image) for those ids,
// unknown ids skipped (#138, ADR-0008) — the one batched request the shared
// entity loader makes for every object a map references. No ids, no request.
export const getMany = (
  ids: readonly number[],
): Effect.Effect<readonly TileObject[], HttpError, Http> =>
  ids.length === 0
    ? Effect.succeed([])
    : Effect.gen(function* () {
        const http = yield* Http
        const path = `/tile_objects?ids=${ids.join(',')}`
        const raw = yield* http.get(path)
        return yield* decodeMany(path)(raw)
      })

// GET /tile_objects[?kind=] -> roster summaries (no image), for the saved-
// objects list. Optional kind filter.
export const list = (
  kind?: string,
): Effect.Effect<readonly TileObjectSummary[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/tile_objects${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`
    const raw = yield* http.get(path)
    return yield* decodeSummaries(path)(raw)
  })

// POST /tile_objects/:id/activate -> make that object the live one of its kind.
export const activate = (
  id: number,
): Effect.Effect<TileObjectSummary, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/tile_objects/${id}/activate`
    const raw = yield* http.post(path, {})
    return yield* decodeSummary(path)(raw)
  })

// POST /tile_objects/:id/deactivate -> turn it off; its kind falls back to the
// game's procedural default.
export const deactivate = (
  id: number,
): Effect.Effect<TileObjectSummary, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/tile_objects/${id}/deactivate`
    const raw = yield* http.post(path, {})
    return yield* decodeSummary(path)(raw)
  })

// DELETE /tile_objects/:id -> remove a saved object for good (204, no body). If
// it was the active one of its kind, the game falls back to its default (#35).
export const del = (id: number): Effect.Effect<void, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.del(`/tile_objects/${id}`)
  })

export const TileObjectsService = { getActive, get, getMany, save, list, activate, deactivate, del } as const
