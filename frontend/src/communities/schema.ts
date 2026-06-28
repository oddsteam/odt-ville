// effect/Schema decoders for the communities + content-feed API surface.
// These shapes mirror the Rails serializers (CommunitiesSerializer,
// ContentFeedSerializer, Serialization.content_item) and act as the single
// source of truth for what the frontend will accept from the backend. Decode
// failures surface as typed errors at the data-layer edge.

import * as Schema from 'effect/Schema'

export const BoardType = Schema.Literal('must_know', 'should_know', 'nice_to_know')
export const Priority = Schema.Literal('urgent', 'important', 'normal')
export const ItemState = Schema.Literal('unread', 'opened', 'acknowledged')

export const CategoryKey = Schema.String

const BoardSummary = Schema.Struct({
  board_type: BoardType,
  item_count: Schema.Number,
  unread_count: Schema.Number,
})

const Badges = Schema.Struct({
  unread: Schema.Number,
  urgent: Schema.Number,
  requires_ack: Schema.Number,
})

export const Community = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  color: Schema.String,
  logo_url: Schema.String,
  category_key: CategoryKey,
  position_order: Schema.Number,
  // Per-house entry gate (issue #24): the gate type the door runs (e.g.
  // 'posture-login') or null when ungated. Optional so older payloads decode.
  entry_gate: Schema.optional(Schema.NullOr(Schema.String)),
  badges: Badges,
  boards: Schema.Array(BoardSummary),
})
export type Community = Schema.Schema.Type<typeof Community>

export const CommunitiesResponse = Schema.Struct({
  communities: Schema.Array(Community),
})
export type CommunitiesResponse = Schema.Schema.Type<typeof CommunitiesResponse>

export const FeedItem = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  summary: Schema.String,
  body: Schema.String,
  priority: Priority,
  effective_from: Schema.NullOr(Schema.String),
  expires_at: Schema.NullOr(Schema.String),
  requires_ack: Schema.Boolean,
  state: ItemState,
  opened_at: Schema.NullOr(Schema.String),
  acknowledged_at: Schema.NullOr(Schema.String),
  community_id: Schema.Number,
  community_title: Schema.String,
  board_type: BoardType,
})
export type FeedItem = Schema.Schema.Type<typeof FeedItem>

export const FeedResponse = Schema.Struct({
  items: Schema.Array(FeedItem),
})
export type FeedResponse = Schema.Schema.Type<typeof FeedResponse>

// Body the admin panel POSTs when creating a community. Echoes the Rails
// `community_params` permit list. Kept as a separate type so callers can't
// accidentally pass server-side fields like id / position_order.
export const NewCommunity = Schema.Struct({
  title: Schema.String,
  color: Schema.String,
  logo_url: Schema.String,
  category_key: CategoryKey,
})
export type NewCommunity = Schema.Schema.Type<typeof NewCommunity>

// Body the admin PATCHes to set/clear a house's entry gate (issue #38).
// entry_gate null clears the gate; 'posture-login' requires a posture_set_id.
// Plain type, not a Schema: it's a request body, never decoded from the wire.
export type CommunityGate = {
  readonly entry_gate: string | null
  readonly posture_set_id: string | null
}
