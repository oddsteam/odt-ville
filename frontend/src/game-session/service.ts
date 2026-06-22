// Effect-based game-session resource service. Methods return typed Effects
// over the data-layer errors (RequestError | NetworkError | DecodeError) —
// callers `runEdge(...)` them at the React boundary. No React, no DOM.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { GameSession, type GameSessionUpdate } from './schema.ts'

const decodeSession = Schema.decodeUnknown(GameSession)

const decode = (raw: unknown) =>
  Effect.mapError(
    decodeSession(raw),
    (e) =>
      new DecodeError({
        path: '/game/session',
        reason: e instanceof Error ? e.message : String(e),
      }),
  )

// GET /game/session -> GameSession
export const get = (): Effect.Effect<GameSession, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.get('/game/session')
    return yield* decode(raw)
  })

// PUT /game/session -> GameSession (the saved + re-resolved session)
export const save = (
  body: GameSessionUpdate,
): Effect.Effect<GameSession, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const raw = yield* http.put('/game/session', body)
    return yield* decode(raw)
  })

export const GameSessionService = { get, save } as const
