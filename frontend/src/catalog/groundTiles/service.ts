// Effect-based ground-tile resource service — reads only; mutations live in
// write.ts (#196). Methods return typed Effects over the data-layer errors
// (RequestError | NetworkError | DecodeError) — callers `runEdge(...)` them at
// the React boundary. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../../lib/http.ts'
import type { HttpError } from '../../lib/http.ts'
import { GroundTile } from './schema.ts'

const decodeList = Schema.decodeUnknown(Schema.Array(GroundTile))

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

// GET /ground_tiles -> GroundTile[] (optionally filtered by surface type).
export const list = (
  type?: string,
): Effect.Effect<readonly GroundTile[], HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/ground_tiles${type ? `?type=${encodeURIComponent(type)}` : ''}`
    const raw = yield* http.get(path)
    return yield* decode(path, decodeList)(raw)
  })

export const GroundTilesService = { list } as const

// The bundled tileset vocabulary is part of the read surface (ADR-0010):
// cross-module callers reach it here, not via ./tilesets.js directly.
export { TILESETS, tilesetUrl } from './tilesets.js'
