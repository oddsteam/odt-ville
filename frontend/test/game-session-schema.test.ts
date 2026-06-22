import { describe, expect, it } from 'vitest'
import * as Schema from 'effect/Schema'
import { Either } from 'effect'

import { GameSession } from '../src/game-session/schema.ts'

describe('GameSession schema', () => {
  const valid = {
    last_area: 'town',
    last_community_id: 7,
    last_room: null,
    spawn: { area: 'town', last_community_id: 7 },
  }

  it('decodes a well-formed payload from the Rails session endpoint', () => {
    const result = Schema.decodeUnknownEither(GameSession)(valid)
    expect(Either.isRight(result)).toBe(true)
  })

  it('accepts a null last_community_id (first-time / lapsed visitor)', () => {
    const result = Schema.decodeUnknownEither(GameSession)({
      ...valid,
      last_community_id: null,
      spawn: { area: 'town', last_community_id: null },
    })
    expect(Either.isRight(result)).toBe(true)
  })

  it('rejects an unknown last_area literal', () => {
    const result = Schema.decodeUnknownEither(GameSession)({
      ...valid,
      last_area: 'dungeon',
    })
    expect(Either.isLeft(result)).toBe(true)
  })

  it('rejects when spawn is missing', () => {
    const { spawn, ...withoutSpawn } = valid
    const result = Schema.decodeUnknownEither(GameSession)(withoutSpawn)
    expect(Either.isLeft(result)).toBe(true)
  })

  it('rejects when last_community_id is the wrong type', () => {
    const result = Schema.decodeUnknownEither(GameSession)({
      ...valid,
      last_community_id: 'seven',
    })
    expect(Either.isLeft(result)).toBe(true)
  })
})
