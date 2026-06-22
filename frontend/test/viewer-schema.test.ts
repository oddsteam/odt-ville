import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { Viewer } from '../src/viewer/schema.ts'

describe('Viewer schema', () => {
  const valid = {
    user: { id: 1, name: 'Pat', role: 'admin' },
    company: { id: 42, name: 'ODT' },
  }

  it('decodes the payload from /api/v1/me', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(Viewer)(valid))).toBe(true)
  })

  it('rejects when user is missing', () => {
    const { user, ...withoutUser } = valid
    expect(Either.isLeft(Schema.decodeUnknownEither(Viewer)(withoutUser))).toBe(true)
  })

  it('rejects when company is missing', () => {
    const { company, ...withoutCompany } = valid
    expect(Either.isLeft(Schema.decodeUnknownEither(Viewer)(withoutCompany))).toBe(true)
  })

  it('rejects when user.id is the wrong type', () => {
    expect(
      Either.isLeft(
        Schema.decodeUnknownEither(Viewer)({
          ...valid,
          user: { ...valid.user, id: 'one' },
        }),
      ),
    ).toBe(true)
  })

  it('rejects when company.name is missing', () => {
    expect(
      Either.isLeft(
        Schema.decodeUnknownEither(Viewer)({
          ...valid,
          company: { id: 42 },
        }),
      ),
    ).toBe(true)
  })
})
