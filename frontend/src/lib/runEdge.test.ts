import { describe, expect, it } from 'vitest'
import * as Effect from 'effect/Effect'

import { runEdge } from './runEdge.ts'
import { DecodeError, NetworkError, RequestError } from './http.ts'

describe('runEdge', () => {
  it('resolves with the effect value', async () => {
    await expect(runEdge(Effect.succeed(42))).resolves.toBe(42)
  })

  it('rejects with the tagged error itself, not a FiberFailure wrapper', async () => {
    const failure = new RequestError({ path: '/x', status: 401, body: '' })
    await expect(runEdge(Effect.fail(failure))).rejects.toBe(failure)
  })
})

describe('HttpError messages', () => {
  it('RequestError names the path and status', () => {
    const e = new RequestError({ path: '/communities', status: 503, body: '' })
    expect(e.message).toContain('/communities')
    expect(e.message).toContain('503')
  })

  it('NetworkError names the path and reason', () => {
    const e = new NetworkError({ path: '/me', reason: 'Failed to fetch' })
    expect(e.message).toContain('/me')
    expect(e.message).toContain('Failed to fetch')
  })

  it('DecodeError names the path and reason', () => {
    const e = new DecodeError({ path: '/me', reason: 'Unexpected token' })
    expect(e.message).toContain('/me')
    expect(e.message).toContain('Unexpected token')
  })
})
