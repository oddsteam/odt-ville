// NpcsWrite — the NPC catalog's mutation surface (#260), the thing that lets a
// human put a row in the decorate editor's trainer picker. Pins the request
// each call makes: an edit that keeps the current rig must not resend the
// rig ref, and a level the admin left blank must reach the backend as null (an
// NPC that never duels has no level) rather than as the number 0.

import { describe, expect, it } from 'vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { Http, type HttpError } from '../src/lib/http.ts'
import { NpcsWrite } from '../src/catalog/npcs/write.ts'

type Call = { method: string; path: string; body?: unknown }

// Fake Http that records the call and answers with a valid NPC record, so the
// decode succeeds and the assertion is about the request we made.
function recordingHttp(seen: Call[]) {
  const npc = { id: 1, name: 'Gate Guard', level: 99, enabled: true, character_manifest_id: 7 }
  const record =
    (method: string) =>
    (path: string, body?: unknown): Effect.Effect<unknown, HttpError> => {
      seen.push({ method, path, body })
      return Effect.succeed(npc)
    }
  const client = {
    get: record('GET'),
    post: record('POST'),
    patch: record('PATCH'),
    put: record('PUT'),
    del: record('DELETE'),
  }
  return Layer.succeed(Http, client as never)
}

const run = <A>(effect: Effect.Effect<A, HttpError, Http>, seen: Call[]) =>
  Effect.runPromise(Effect.provide(effect, recordingHttp(seen)))

describe('NpcsWrite', () => {
  it('POSTs a new NPC to the catalog', async () => {
    const seen: Call[] = []
    const created = await run(
      NpcsWrite.create({ name: 'Gate Guard', character_manifest_id: 7, level: 99, enabled: true }),
      seen,
    )

    expect(seen).toEqual([
      {
        method: 'POST',
        path: '/npcs',
        body: { name: 'Gate Guard', character_manifest_id: 7, level: 99, enabled: true },
      },
    ])
    expect(created.name).toBe('Gate Guard')
  })

  it('carries a blank level through as null — not every NPC duels', async () => {
    const seen: Call[] = []
    await run(
      NpcsWrite.create({ name: 'Wanderer', character_manifest_id: 7, level: null, enabled: true }),
      seen,
    )

    expect(seen[0].body).toMatchObject({ level: null })
  })

  it('PATCHes only the fields it was given, so an unchanged rig is not resent', async () => {
    const seen: Call[] = []
    await run(NpcsWrite.update(7, { name: 'Master', level: 50 }), seen)

    expect(seen).toEqual([
      { method: 'PATCH', path: '/npcs/7', body: { name: 'Master', level: 50 } },
    ])
  })

  it('DELETEs an NPC by id', async () => {
    const seen: Call[] = []
    await run(NpcsWrite.del(7), seen)

    expect(seen).toEqual([{ method: 'DELETE', path: '/npcs/7', body: undefined }])
  })
})
