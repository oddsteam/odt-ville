// Standees write surface (#369, ADR-0015): deploying is a *durable* REST write,
// split from the reads in service.ts so the write boundary is import-separable
// (#196). Only the shell may import this — the game black box never touches a
// data service (ADR-0004); the deploy affordance calls in through the shell.

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DecodeError, Http } from '../lib/http.ts'
import type { HttpError } from '../lib/http.ts'
import { Standee, type NewStandee } from './schema.ts'

const decodeStandee = (path: string) => (raw: unknown) =>
  Effect.mapError(
    Schema.decodeUnknown(Standee)(raw),
    (e) => new DecodeError({ path, reason: e instanceof Error ? e.message : String(e) }),
  )

// POST /maps/:slug/standees -> the deployed Standee. Refused with a 422 on a
// non-multiplayer map (a generated hometown has an audience of one).
export const deploy = (
  mapSlug: string,
  body: NewStandee,
): Effect.Effect<Standee, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    const path = `/maps/${mapSlug}/standees`
    const raw = yield* http.post(path, body)
    return yield* decodeStandee(path)(raw)
  })

// DELETE /standees/:id -> pick up your own Standee (#370). Owner-only server-side
// (a non-owner is refused with 403); on success the slot is freed at once, so
// the owner can redeploy immediately. No body comes back — a 204.
export const pickUp = (id: number): Effect.Effect<void, HttpError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http
    yield* http.del(`/standees/${id}`)
  })

export const StandeesWrite = { deploy, pickUp } as const
