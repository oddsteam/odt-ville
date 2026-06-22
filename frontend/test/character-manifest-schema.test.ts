import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { ActiveManifest } from '../src/character/schema.ts'

describe('ActiveManifest schema', () => {
  const valid = {
    id: 1,
    name: 'scout',
    active: true,
    updated_at: '2026-06-22T00:00:00.000Z',
    data: { version: 1, name: 'scout', postures: {} },
  }

  it('decodes the active-manifest envelope from the Rails endpoint', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(ActiveManifest)(valid))).toBe(true)
  })

  it('keeps data loose — any object blob is accepted (normalizeManifest owns its shape)', () => {
    expect(
      Either.isRight(Schema.decodeUnknownEither(ActiveManifest)({ ...valid, data: {} })),
    ).toBe(true)
  })

  it('rejects a missing data blob', () => {
    const { data, ...withoutData } = valid
    expect(Either.isLeft(Schema.decodeUnknownEither(ActiveManifest)(withoutData))).toBe(true)
  })

  it('rejects when active is the wrong type', () => {
    expect(
      Either.isLeft(Schema.decodeUnknownEither(ActiveManifest)({ ...valid, active: 'yes' })),
    ).toBe(true)
  })
})
