import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import {
  Monster,
  MonsterPoolEntry,
  MonsterSummary,
  NewMonster,
  UpdateMonster,
} from '../src/monsters/schema.ts'

describe('MonsterPoolEntry schema (wild-encounter pool row)', () => {
  const valid = { id: 1, name: 'Slime', encounter_rate: 3, image: 'data:image/png;base64,abc' }

  it('decodes a pool row: id, name, weight, and the sprite image', () => {
    expect(Schema.decodeUnknownSync(MonsterPoolEntry)(valid).image).toBe('data:image/png;base64,abc')
  })

  it('rejects a pool row missing the image (the game needs the sprite)', () => {
    const { image, ...withoutImage } = valid
    void image
    expect(Either.isLeft(Schema.decodeUnknownEither(MonsterPoolEntry)(withoutImage))).toBe(true)
  })
})

describe('MonsterSummary schema', () => {
  const valid = {
    id: 1,
    name: 'Slime',
    encounter_dialog: 'A wild Slime appears!',
    encounter_rate: 3,
    enabled: true,
    probability: 0.75,
    updated_at: '2026-06-28T00:00:00.000Z',
  }

  it('decodes a well-formed roster row from the Rails monster endpoint', () => {
    expect(Either.isRight(Schema.decodeUnknownEither(MonsterSummary)(valid))).toBe(true)
  })

  it('allows a null encounter_dialog', () => {
    const decoded = Schema.decodeUnknownSync(MonsterSummary)({ ...valid, encounter_dialog: null })
    expect(decoded.encounter_dialog).toBeNull()
  })

  it('keeps probability as a fraction in [0, 1]', () => {
    const decoded = Schema.decodeUnknownSync(MonsterSummary)({ ...valid, probability: 0 })
    expect(decoded.probability).toBe(0)
  })

  it('rejects a roster row that leaks the heavy image blob shape via wrong types', () => {
    expect(
      Either.isLeft(Schema.decodeUnknownEither(MonsterSummary)({ ...valid, encounter_rate: '3' })),
    ).toBe(true)
  })
})

describe('Monster schema (full record from create/update)', () => {
  const valid = {
    id: 1,
    name: 'Slime',
    encounter_dialog: 'A wild Slime appears!',
    encounter_rate: 3,
    enabled: true,
    probability: 0.75,
    updated_at: '2026-06-28T00:00:00.000Z',
    image: 'data:image/png;base64,abc',
  }

  it('decodes the full record incl. the image data URL', () => {
    const decoded = Schema.decodeUnknownSync(Monster)(valid)
    expect(decoded.image).toBe('data:image/png;base64,abc')
  })

  it('rejects a record missing the image blob', () => {
    const { image, ...withoutImage } = valid
    void image
    expect(Either.isLeft(Schema.decodeUnknownEither(Monster)(withoutImage))).toBe(true)
  })
})

describe('NewMonster schema (create body)', () => {
  const body = {
    name: 'Slime',
    image: 'data:image/png;base64,abc',
    encounter_dialog: 'A wild Slime appears!',
    encounter_rate: 3,
    enabled: true,
  }

  it('encodes a well-formed create body', () => {
    expect(Either.isRight(Schema.encodeUnknownEither(NewMonster)(body))).toBe(true)
  })

  it('rejects a body with a non-numeric encounter rate', () => {
    expect(
      Either.isLeft(Schema.encodeUnknownEither(NewMonster)({ ...body, encounter_rate: '3' })),
    ).toBe(true)
  })
})

describe('UpdateMonster schema (edit body — every field optional)', () => {
  it('encodes a full edit body', () => {
    const body = {
      name: 'Slime King',
      image: 'data:image/png;base64,abc',
      encounter_dialog: 'Bow!',
      encounter_rate: 4,
      enabled: false,
    }
    expect(Either.isRight(Schema.encodeUnknownEither(UpdateMonster)(body))).toBe(true)
  })

  it('encodes a partial body that omits the unchanged image', () => {
    expect(
      Either.isRight(Schema.encodeUnknownEither(UpdateMonster)({ encounter_rate: 9 })),
    ).toBe(true)
  })

  it('encodes an empty body', () => {
    expect(Either.isRight(Schema.encodeUnknownEither(UpdateMonster)({}))).toBe(true)
  })

  it('still rejects a present-but-wrongly-typed field', () => {
    expect(
      Either.isLeft(Schema.encodeUnknownEither(UpdateMonster)({ encounter_rate: '9' })),
    ).toBe(true)
  })
})
