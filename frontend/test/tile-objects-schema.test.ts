import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { TileObject } from '../src/tileObjects/schema.ts'

describe('TileObject schema', () => {
  const valid = {
    id: 1,
    name: 'oak',
    kind: 'tree',
    footprint_w: 2,
    footprint_h: 3,
    active: true,
    updated_at: '2026-06-22T00:00:00.000Z',
    image: 'data:image/png;base64,xxx',
  }

  it('decodes a well-formed payload from the Rails tile-object endpoint', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(TileObject)(valid))).toBe(true)
  })

  it('rejects a missing image (the blob the game draws)', () => {
    const { image, ...withoutImage } = valid
    expect(Either.isLeft(Schema.decodeUnknownEither(TileObject)(withoutImage))).toBe(true)
  })

  it('rejects when footprint_w is the wrong type', () => {
    expect(
      Either.isLeft(Schema.decodeUnknownEither(TileObject)({ ...valid, footprint_w: '2' })),
    ).toBe(true)
  })
})
