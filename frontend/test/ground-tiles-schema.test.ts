import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { GroundTile } from '../src/groundTiles/schema.ts'

describe('GroundTile schema', () => {
  const valid = {
    id: 1,
    tile_type: 'grass',
    tileset: 'serene_village',
    col: 4,
    row: 2,
    cell: 32,
    label: '',
    role: 'fill',
    side: null,
    updated_at: '2026-06-22T00:00:00.000Z',
  }

  it('decodes a well-formed payload from the Rails ground-tile endpoint', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(GroundTile)(valid))).toBe(true)
  })

  it('accepts a string side (edge / corner tiles carry a direction)', () => {
    expect(
      Either.isRight(Schema.decodeUnknownEither(GroundTile)({ ...valid, role: 'edge', side: 'N' })),
    ).toBe(true)
  })

  it('rejects when col is the wrong type', () => {
    expect(
      Either.isLeft(Schema.decodeUnknownEither(GroundTile)({ ...valid, col: '4' })),
    ).toBe(true)
  })

  it('rejects a missing tile_type', () => {
    const { tile_type, ...withoutType } = valid
    expect(Either.isLeft(Schema.decodeUnknownEither(GroundTile)(withoutType))).toBe(true)
  })
})
