import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { BakedMap } from '../src/maps/schema.ts'

describe('BakedMap schema', () => {
  const valid = {
    slug: 'atrium',
    title: 'The Atrium',
    cols: 2,
    rows: 2,
    tilesets: [{ name: '1_Terrains_and_Fences_32x32', cell: 32 }],
    tiles: [
      [
        { tileset: '1_Terrains_and_Fences_32x32', frame: 0 },
        { tileset: '1_Terrains_and_Fences_32x32', frame: 0 },
      ],
      [{ tileset: '1_Terrains_and_Fences_32x32', frame: 0 }, null],
    ],
    entities: [
      { kind: 'prop', tileset: '1_Terrains_and_Fences_32x32', frame: 5, x: 1, y: 0 },
    ],
  }

  it('decodes a well-formed baked map from the Rails maps endpoint', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(BakedMap)(valid))).toBe(true)
  })

  it('accepts a transparent (null) cell in the grid', () => {
    const decoded = Schema.decodeUnknownEither(BakedMap)(valid)
    expect(Either.isRight(decoded)).toBe(true)
    if (Either.isRight(decoded)) expect(decoded.right.tiles[1][1]).toBeNull()
  })

  it('rejects a tile cell missing its frame', () => {
    const broken = {
      ...valid,
      tiles: [[{ tileset: 'x' }]],
      cols: 1,
      rows: 1,
    }
    expect(Either.isLeft(Schema.decodeUnknownEither(BakedMap)(broken))).toBe(true)
  })

  it('rejects when rows is the wrong type', () => {
    expect(Either.isLeft(Schema.decodeUnknownEither(BakedMap)({ ...valid, rows: '2' }))).toBe(true)
  })
})
