import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { BakedMap, ZonePayload } from '../src/kernel/schema.ts'

describe('BakedMap schema', () => {
  const valid = {
    slug: 'atrium',
    title: 'The Atrium',
    cols: 2,
    rows: 2,
    tilesets: [{ name: 'terrain/1_Terrains_and_Fences_32x32', cell: 32 }],
    tiles: [
      [
        { tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: 0 },
        { tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: 0 },
      ],
      [{ tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: 0 }, null],
    ],
    entities: [
      { kind: 'prop', tileset: 'terrain/1_Terrains_and_Fences_32x32', frame: 5, x: 1, y: 0 },
    ],
  }

  it('decodes a well-formed baked map from the Rails maps endpoint', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(BakedMap)(valid))).toBe(true)
  })

  // Presence (#88): the runtime opens a presence channel off this flag.
  it('decodes the multiplayer flag', () => {
    const decoded = Schema.decodeUnknownEither(BakedMap)({ ...valid, multiplayer: true })
    expect(Either.isRight(decoded)).toBe(true)
    if (Either.isRight(decoded)) expect(decoded.right.multiplayer).toBe(true)
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

describe('ZonePayload encounter member (#87)', () => {
  it('decodes an encounter payload naming a pool', () => {
    const decoded = Schema.decodeUnknownEither(ZonePayload)({ kind: 'encounter', pool: 'cave' })
    expect(Either.isRight(decoded)).toBe(true)
    if (Either.isRight(decoded) && decoded.right.kind === 'encounter') {
      expect(decoded.right.pool).toBe('cave')
    }
  })

  it('accepts the empty slug (the whole global pool, #69 fallback)', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(ZonePayload)({ kind: 'encounter', pool: '' }))).toBe(true)
  })

  it('rejects an encounter payload with no pool field', () => {
    expect(Either.isLeft(Schema.decodeUnknownEither(ZonePayload)({ kind: 'encounter' }))).toBe(true)
  })
})
