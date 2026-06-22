// Effect-based viewer (current-user) resource service. Returns a typed Effect
// over the data-layer errors (RequestError | NetworkError | DecodeError) —
// callers `runEdge(...)` it at the React boundary. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { Viewer } from './schema.ts'

const decodeViewer = Schema.decodeUnknown(Viewer)

const decode = (raw: unknown) =>
  Effect.mapError(
    decodeViewer(raw),
    (e) =>
      new DecodeError({
        path: '/me',
        reason: e instanceof Error ? e.message : String(e),
      }),
  )

// GET /me -> Viewer
export const get = (): Effect.Effect<Viewer, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.get('/me')
    return yield* decode(raw)
  })

export const ViewerService = { get } as const
