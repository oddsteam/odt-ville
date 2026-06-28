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
    door_dx: null,
    door_dy: null,
    walk_mask: null,
    active: true,
    updated_at: '2026-06-22T00:00:00.000Z',
    image: 'data:image/png;base64,xxx',
    fg_mask: null,
  }

  it('decodes a well-formed payload from the Rails tile-object endpoint', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(TileObject)(valid))).toBe(true)
  })

  it('decodes an authored walk mask as an array of strings (#32)', () => {
    const mask = ['###', '#.#', '#.#', '#.#']
    const decoded = Schema.decodeUnknownSync(TileObject)({ ...valid, walk_mask: mask })
    expect(decoded.walk_mask).toEqual(mask)
  })

  it('decodes a foreground mask data URL (#36)', () => {
    const fg = 'data:image/png;base64,maskblob'
    const decoded = Schema.decodeUnknownSync(TileObject)({ ...valid, fg_mask: fg })
    expect(decoded.fg_mask).toBe(fg)
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
