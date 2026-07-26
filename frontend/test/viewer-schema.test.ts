import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { Viewer } from '../src/viewer/schema.ts'

describe('Viewer schema', () => {
  const valid = {
    user: {
      id: 1,
      name: 'Pat',
      role: 'admin',
      external_id: 'kc-sub-1',
      avatar_url: '/api/v1/users/kc-sub-1/avatar',
    },
    company: { id: 42, name: 'ODT' },
    roles: ['admin'],
  }

  it('decodes the payload from /api/v1/me', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(Viewer)(valid))).toBe(true)
  })

  // Avatars (#320): a person with none serialises null, and the header falls
  // back — so null has to decode, not blow up the whole viewer payload.
  it('decodes a null avatar_url', () => {
    expect(
      Either.isRight(
        Schema.decodeUnknownEither(Viewer)({ ...valid, user: { ...valid.user, avatar_url: null } }),
      ),
    ).toBe(true)
  })

  // Presence (#88): the client filters its own echoed frames by this id.
  it('rejects when user.external_id is missing', () => {
    const { external_id, ...userWithout } = valid.user
    expect(
      Either.isLeft(Schema.decodeUnknownEither(Viewer)({ ...valid, user: userWithout })),
    ).toBe(true)
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
