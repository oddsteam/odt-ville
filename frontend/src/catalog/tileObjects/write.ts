// Tile-object catalog write surface (#196): mutations that change what exists
// in the catalog, split from the reads in service.ts so the write boundary is
// import-separable. Only Content Authoring may import this module; Map
// Authoring reads the catalog via service.ts.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../../lib/http.ts'
import type { HttpError } from '../../lib/http.ts'
import { TileObject, TileObjectSummary, type NewTileObject } from './schema.ts'

const decodeWith =
  <A>(schema: Schema.Schema<A>) =>
  (path: string) =>
  (raw: unknown) =>
    Effect.mapError(Schema.decodeUnknown(schema)(raw), (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }))

const decode = decodeWith(TileObject)
const decodeSummary = decodeWith(TileObjectSummary)

// POST /tile_objects -> the saved object, made the live object of its kind.
export const save = (
  body: NewTileObject,
): Effect.Effect<TileObject, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.post('/tile_objects', { ...body, active: true })
    return yield* decode('/tile_objects')(raw)
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

export const TileObjectsWrite = { save, activate, deactivate, del } as const
