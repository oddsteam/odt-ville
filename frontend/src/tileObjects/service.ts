// Effect-based tile-object resource service. Methods return typed Effects over
// the data-layer errors (RequestError | NetworkError | DecodeError) — callers
// `runEdge(...)` them at the React boundary. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { TileObject, type NewTileObject } from './schema.ts'

const decodeTileObject = Schema.decodeUnknown(TileObject)

const decode = (path: string) => (raw: unknown) =>
  Effect.mapError(
    decodeTileObject(raw),
    (e) =>
      new DecodeError({
        path,
        reason: e instanceof Error ? e.message : String(e),
      }),
  )

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

// POST /tile_objects -> the saved object, made the live object of its kind.
export const save = (
  body: NewTileObject,
): Effect.Effect<TileObject, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.post('/tile_objects', { ...body, active: true })
    return yield* decode('/tile_objects')(raw)
  })

export const TileObjectsService = { getActive, save } as const
