import { describe, expect, it, afterEach, vi } from 'vitest'
import * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'

import { CharacterService } from '../src/character/service.ts'
import { runEdge } from '../src/lib/runEdge.ts'
import { AppRuntime } from '../src/lib/runtime.ts'
import {
  loadActiveManifest,
  loadMyManifest,
  normalizeManifest,
} from '../src/character/manifest.js'

// Route a fetch mock by URL substring -> Response, so a single call can serve
// both /character_manifests/active and the committed-default file.
function routeFetch(routes: Record<string, Response>) {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    for (const [needle, res] of Object.entries(routes)) {
      if (url.includes(needle)) return res.clone()
    }
    throw new TypeError(`unrouted fetch: ${url}`)
  })
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const envelope = {
  id: 1,
  name: 'scout',
  active: true,
  updated_at: '2026-06-22T00:00:00.000Z',
  data: { version: 1, name: 'scout', postures: { walkDown: [{ x: 0 }] } },
}

describe('CharacterService.getActive', () => {
  it('returns the decoded data blob when the backend has an active manifest', async () => {
    globalThis.fetch = routeFetch({
      '/character_manifests/active': new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const data = await runEdge(CharacterService.getActive())
    expect(data).toEqual(envelope.data)
  })

  it('returns null when nothing is active (204)', async () => {
    globalThis.fetch = routeFetch({
      '/character_manifests/active': new Response(null, { status: 204 }),
    }) as unknown as typeof fetch

    const data = await runEdge(CharacterService.getActive())
    expect(data).toBeNull()
  })
})

describe('CharacterService.list', () => {
  it('returns the decoded roster summaries', async () => {
    const summaries = [
      { id: 1, name: 'scout', active: true, updated_at: '2026-06-22T00:00:00.000Z' },
      { id: 2, name: 'ranger', active: false, updated_at: '2026-06-21T00:00:00.000Z' },
    ]
    globalThis.fetch = routeFetch({
      '/character_manifests': new Response(JSON.stringify(summaries), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const out = await runEdge(CharacterService.list())
    expect(out).toEqual(summaries)
  })

  it('surfaces a typed DecodeError when the roster row is malformed', async () => {
    globalThis.fetch = routeFetch({
      '/character_manifests': new Response(
        JSON.stringify([{ id: 1, name: 'scout', active: 'yes', updated_at: '' }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    }) as unknown as typeof fetch

    const exit = await AppRuntime.runPromiseExit(CharacterService.list())
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const fail = Cause.failureOption(exit.cause)
      expect(fail._tag).toBe('Some')
      if (fail._tag === 'Some') {
        const e = fail.value as { _tag: string; path: string }
        expect(e._tag).toBe('DecodeError')
        expect(e.path).toBe('/character_manifests')
      }
    }
  })
})

describe('CharacterService.getById', () => {
  it('returns the decoded data blob for a manifest by id', async () => {
    globalThis.fetch = routeFetch({
      '/character_manifests/1': new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const data = await runEdge(CharacterService.getById(1))
    expect(data).toEqual(envelope.data)
  })
})

describe('CharacterService.save', () => {
  it('POSTs the manifest with active:true and decodes the saved envelope', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const body = { version: 1, name: 'scout', postures: {} }
    const saved = await runEdge(CharacterService.save(body))
    expect(saved.name).toBe('scout')
    expect(saved.data).toEqual(envelope.data)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/api/v1/character_manifests')
    expect(calls[0]!.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      manifest: body,
      active: true,
    })
  })
})

describe('CharacterService.getForMe', () => {
  it('returns the resolved envelope when the backend has one', async () => {
    globalThis.fetch = routeFetch({
      '/character_manifests/for_me': new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const env = await runEdge(CharacterService.getForMe())
    expect(env?.id).toBe(1)
    expect(env?.data).toEqual(envelope.data)
  })

  it('returns null when neither a pick nor a global active exists (204)', async () => {
    globalThis.fetch = routeFetch({
      '/character_manifests/for_me': new Response(null, { status: 204 }),
    }) as unknown as typeof fetch

    const env = await runEdge(CharacterService.getForMe())
    expect(env).toBeNull()
  })
})

describe('CharacterService.select', () => {
  it('POSTs to /character_manifests/:id/select and decodes the summary', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      const { data: _data, ...summary } = envelope
      return new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const picked = await runEdge(CharacterService.select(1))
    expect(picked.id).toBe(1)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/api/v1/character_manifests/1/select')
    expect(calls[0]!.init?.method).toBe('POST')
  })
})

describe('normalizeManifest', () => {
  it('fills missing fields from the empty manifest', () => {
    const out = normalizeManifest({ name: 'hero', postures: { walkDown: [{ x: 1 }] } })
    expect(out.name).toBe('hero')
    expect(out.grid).toEqual({ frameWidth: 32, frameHeight: 64 })
    expect(out.frameRate).toBe(9)
    expect(out.postures.walkDown).toEqual([{ x: 1 }])
    expect(out.postures.idleUp).toEqual([]) // unspecified slot filled empty
  })

  it('returns the empty manifest for a non-object input', () => {
    expect(normalizeManifest(null).name).toBe('untitled')
  })
})

describe('loadActiveManifest resolution chain', () => {
  it('uses the remote active manifest when the backend has one', async () => {
    globalThis.fetch = routeFetch({
      // Remote wins; the committed default is intentionally unrouted —
      // reaching it would throw, proving remote short-circuits first.
      '/character_manifests/active': new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const m = await loadActiveManifest()
    expect(m.name).toBe('scout')
    expect(m.postures.walkDown).toEqual([{ x: 0 }])
    expect(m.frameRate).toBe(9) // normalized
  })

  it('falls back to the committed default when no remote is active', async () => {
    globalThis.fetch = routeFetch({
      '/character_manifests/active': new Response(null, { status: 204 }),
      'scout.json': new Response(JSON.stringify({ name: 'scout-default', grid: { frameWidth: 16 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const m = await loadActiveManifest()
    expect(m.name).toBe('scout-default')
    expect(m.grid.frameWidth).toBe(16) // provided by the default file
    expect(m.grid.frameHeight).toBe(64) // filled by normalize
  })
})

describe('loadMyManifest resolution chain (#155)', () => {
  it("uses the user's server-resolved manifest when for_me returns one", async () => {
    globalThis.fetch = routeFetch({
      // for_me wins; the committed default is intentionally unrouted.
      '/character_manifests/for_me': new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const m = await loadMyManifest()
    expect(m.name).toBe('scout')
    expect(m.postures.walkDown).toEqual([{ x: 0 }])
  })

  it('falls back to the committed default on 204 (no pick, no global active)', async () => {
    globalThis.fetch = routeFetch({
      '/character_manifests/for_me': new Response(null, { status: 204 }),
      'scout.json': new Response(JSON.stringify({ name: 'scout-default' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const m = await loadMyManifest()
    expect(m.name).toBe('scout-default')
  })

  it('falls back to the committed default when the backend is unreachable', async () => {
    globalThis.fetch = routeFetch({
      'scout.json': new Response(JSON.stringify({ name: 'scout-default' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }) as unknown as typeof fetch

    const m = await loadMyManifest()
    expect(m.name).toBe('scout-default')
  })
})
