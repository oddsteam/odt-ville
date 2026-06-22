import { describe, expect, it, afterEach, vi } from 'vitest'

import { CharacterService } from '../src/character/service.ts'
import { runEdge } from '../src/lib/runEdge.ts'
import {
  ACTIVE_KEY,
  loadActiveManifest,
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

// Minimal in-memory localStorage (the test env is node, which has none).
function installLocalStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries))
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  delete (globalThis as { localStorage?: unknown }).localStorage
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

describe('loadActiveManifest fallback chain', () => {
  it('uses the localStorage manifest when no remote is active', async () => {
    installLocalStorage({
      [ACTIVE_KEY]: JSON.stringify({ name: 'local-guy', postures: { walkUp: [{ x: 2 }] } }),
    })
    globalThis.fetch = routeFetch({
      // No active remote; the committed default is intentionally unrouted —
      // reaching it would throw, proving localStorage short-circuits first.
      '/character_manifests/active': new Response(null, { status: 204 }),
    }) as unknown as typeof fetch

    const m = await loadActiveManifest()
    expect(m.name).toBe('local-guy')
    expect(m.postures.walkUp).toEqual([{ x: 2 }])
    expect(m.frameRate).toBe(9) // normalized
  })

  it('falls back to the committed default when remote and localStorage are empty', async () => {
    installLocalStorage()
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
