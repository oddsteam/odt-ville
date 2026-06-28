import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { PostureSetsResponse } from '../src/posture/schema.ts'

describe('PostureSetsResponse schema', () => {
  it('decodes the posture-set catalog from the Rails proxy', () => {
    const result = Schema.decodeUnknownEither(PostureSetsResponse)({
      posture_sets: [
        { id: 'set-1', name: 'Wave' },
        { id: 'set-2', name: 'Peace' },
      ],
    })
    expect(Either.isRight(result)).toBe(true)
  })

  it('rejects when posture_sets is missing', () => {
    const result = Schema.decodeUnknownEither(PostureSetsResponse)({})
    expect(Either.isLeft(result)).toBe(true)
  })

  it('rejects when a set is missing its name', () => {
    const result = Schema.decodeUnknownEither(PostureSetsResponse)({
      posture_sets: [{ id: 'x' }],
    })
    expect(Either.isLeft(result)).toBe(true)
  })
})
