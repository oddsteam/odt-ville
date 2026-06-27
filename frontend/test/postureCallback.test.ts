import { describe, expect, it } from 'vitest'

import { parseCallbackParams } from '../src/posture/callback.ts'

describe('parseCallbackParams', () => {
  it('pulls the one-time session_id and the status hint out of the redirect query', () => {
    const out = parseCallbackParams('?session_id=sess-9&status=passed')
    expect(out).toEqual({ sessionId: 'sess-9', status: 'passed' })
  })

  it('returns nulls when the params are absent', () => {
    expect(parseCallbackParams('')).toEqual({ sessionId: null, status: null })
  })
})
