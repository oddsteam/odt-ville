import { describe, expect, it } from 'vitest'
import * as Schema from '@effect/schema/Schema'
import { Either } from 'effect'

import { CommunitiesResponse, FeedResponse } from '../src/communities/schema.ts'

describe('CommunitiesResponse schema', () => {
  it('decodes a well-formed payload from the Rails index endpoint', () => {
    const payload = {
      communities: [
        {
          id: 1,
          title: 'Compliance House',
          color: '#C0392B',
          logo_url: '',
          category_key: 'compliance',
          position_order: 1,
          badges: { unread: 2, urgent: 1, requires_ack: 0 },
          boards: [
            { board_type: 'must_know', item_count: 3, unread_count: 1 },
            { board_type: 'should_know', item_count: 2, unread_count: 1 },
            { board_type: 'nice_to_know', item_count: 0, unread_count: 0 },
          ],
        },
      ],
    }
    const result = Schema.decodeUnknownEither(CommunitiesResponse)(payload)
    expect(Either.isRight(result)).toBe(true)
  })

  it('rejects when the communities key is missing', () => {
    const result = Schema.decodeUnknownEither(CommunitiesResponse)({ items: [] })
    expect(Either.isLeft(result)).toBe(true)
  })

  it('rejects when a community is missing required fields', () => {
    const payload = {
      communities: [{ id: 1, title: 'Compliance House' }],
    }
    const result = Schema.decodeUnknownEither(CommunitiesResponse)(payload)
    expect(Either.isLeft(result)).toBe(true)
  })

  it('rejects when a community.id is the wrong type', () => {
    const payload = {
      communities: [
        {
          id: 'not-a-number',
          title: 'X',
          color: '#000',
          logo_url: '',
          category_key: 'community',
          position_order: 1,
          badges: { unread: 0, urgent: 0, requires_ack: 0 },
          boards: [],
        },
      ],
    }
    const result = Schema.decodeUnknownEither(CommunitiesResponse)(payload)
    expect(Either.isLeft(result)).toBe(true)
  })
})

describe('FeedResponse schema', () => {
  const validItem = {
    id: 42,
    title: 'Branch refresh',
    summary: 'Town hall today',
    body: 'Body',
    priority: 'urgent',
    effective_from: '2026-06-01T00:00:00Z',
    expires_at: null,
    requires_ack: true,
    state: 'unread',
    opened_at: null,
    acknowledged_at: null,
    community_id: 1,
    community_title: 'Compliance',
    board_type: 'must_know',
  }

  it('decodes the content-feed payload shape', () => {
    const result = Schema.decodeUnknownEither(FeedResponse)({ items: [validItem] })
    expect(Either.isRight(result)).toBe(true)
  })

  it('rejects when an item has the wrong priority literal', () => {
    const result = Schema.decodeUnknownEither(FeedResponse)({
      items: [{ ...validItem, priority: 'bogus' }],
    })
    expect(Either.isLeft(result)).toBe(true)
  })

  it('rejects when items is missing entirely', () => {
    const result = Schema.decodeUnknownEither(FeedResponse)({})
    expect(Either.isLeft(result)).toBe(true)
  })
})
