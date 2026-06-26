// Effect-based posture-gate resource service (issue #24). Methods return typed
// Effects over the data-layer errors — callers `runEdge(...)` them at the React
// boundary. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { StartResponse, ConfirmResponse } from './schema.ts'

const decodeStart = Schema.decodeUnknown(StartResponse)
const decodeConfirm = Schema.decodeUnknown(ConfirmResponse)

const decode =
  <A>(path: string, decoder: (u: unknown) => Effect.Effect<A, unknown>) =>
  (raw: unknown) =>
    Effect.mapError(
      decoder(raw),
      (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
    )

// POST /game/posture/start — kick off a Verification for a gated house.
export const start = (
  communityId: number,
  callbackUrl: string,
): Effect.Effect<StartResponse, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.post('/game/posture/start', {
      community_id: communityId,
      callback_url: callbackUrl,
    })
    return yield* decode('/game/posture/start', decodeStart)(raw)
  })

// POST /game/posture/confirm — server-to-server result read; opens the gate.
export const confirm = (
  sessionId: string,
): Effect.Effect<ConfirmResponse, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.post('/game/posture/confirm', { session_id: sessionId })
    return yield* decode('/game/posture/confirm', decodeConfirm)(raw)
  })

export const PostureService = { start, confirm } as const
