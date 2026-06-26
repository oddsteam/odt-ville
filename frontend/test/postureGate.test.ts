import { describe, expect, it, vi } from 'vitest'

import { runPostureGate } from '../src/posture/runGate.ts'

// A set of injected deps with sensible passing defaults; override per test.
function deps(over = {}) {
  return {
    start: vi.fn(async () => ({ session_id: 'sess-1', hosted_url: 'https://posture.example/v/1' })),
    openPopup: vi.fn(() => ({})),
    awaitResult: vi.fn(async () => ({ status: 'passed' as string | null })),
    confirm: vi.fn(async () => ({ granted: true, status: 'passed' as string | null })),
    ...over,
  }
}

describe('runPostureGate', () => {
  it('opens the gate on a server-confirmed pass and confirms with the started session', async () => {
    const d = deps()
    const out = await runPostureGate(7, d)

    expect(out).toEqual({ granted: true })
    expect(d.start).toHaveBeenCalledWith(7)
    expect(d.openPopup).toHaveBeenCalledWith('https://posture.example/v/1')
    // The confirm uses OUR started session_id, not anything the popup reported.
    expect(d.confirm).toHaveBeenCalledWith('sess-1')
  })

  it('trusts the server, not the redirect hint: passed hint but server denies → shut', async () => {
    const d = deps({ confirm: vi.fn(async () => ({ granted: false, status: 'pending' })) })
    expect(await runPostureGate(7, d)).toEqual({ granted: false })
  })

  it('short-circuits a non-pass hint without a confirm round-trip', async () => {
    const d = deps({ awaitResult: vi.fn(async () => ({ status: 'cancelled' })) })
    const out = await runPostureGate(7, d)

    expect(out.granted).toBe(false)
    expect(d.confirm).not.toHaveBeenCalled()
  })

  it('reports a blocked popup without starting the confirm', async () => {
    const d = deps({ openPopup: vi.fn(() => null) })
    const out = await runPostureGate(7, d)

    expect(out).toEqual({ granted: false, reason: 'popup-blocked' })
    expect(d.confirm).not.toHaveBeenCalled()
  })
})
