import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { MonsterSummary } from '../src/monsters/schema.ts'

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
