import { describe, expect, it } from 'vitest'
import { backendWarmupGate } from './vite-backend-warmup'

const gate = (probe, opts = {}) =>
  backendWarmupGate('http://backend:3190', { probe, retryMs: 5, deadlineMs: 200, ...opts })

describe('backendWarmupGate', () => {
  it('passes straight through when the backend is up', async () => {
    let calls = 0
    const bypass = gate(async () => (calls++, true))
    await expect(bypass()).resolves.toBeUndefined()
    expect(calls).toBe(1)
  })

  it('retries until the backend accepts, then resolves', async () => {
    let calls = 0
    const bypass = gate(async () => (calls++, calls >= 3))
    await bypass()
    expect(calls).toBe(3)
  })

  it('gives up after the deadline instead of hanging', async () => {
    const bypass = gate(async () => false, { deadlineMs: 30 })
    await expect(bypass()).resolves.toBeUndefined()
  })

  it('shares one probe round across a concurrent burst', async () => {
    let calls = 0
    let release
    const bypass = gate(() => new Promise((r) => { calls++; release = r }))
    const burst = Promise.all([bypass(), bypass(), bypass()])
    await new Promise((r) => setTimeout(r, 10))
    release(true)
    await burst
    expect(calls).toBe(1)
  })
})
