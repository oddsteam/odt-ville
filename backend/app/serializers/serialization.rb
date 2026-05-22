# Shared helpers for building the plain-hash JSON payloads the API returns.
# Kept deliberately boring: no ActiveModel::Serializer, just functions.
module Serialization
  module_function

  PRIORITY_RANK = { "urgent" => 0, "important" => 1, "normal" => 2 }.freeze
  BOARD_ORDER   = { "must_know" => 0, "should_know" => 1, "nice_to_know" => 2 }.freeze

  def priority_rank(priority)
    PRIORITY_RANK.fetch(priority.to_s, 9)
  end

  def board_order(board_type)
    BOARD_ORDER.fetch(board_type.to_s, 9)
  end

  # The per-user state row for an item. Uses preloaded associations when present
  # so callers that `includes(:user_content_states)` avoid N+1 queries.
  def user_state(item, user)
    item.user_content_states.find { |ucs| ucs.user_id == user.id }
  end

  def location(loc)
    {
      last_area: loc.last_area,
      last_house_id: loc.last_house_id,
      last_room: loc.last_room
    }
  end

  # The canonical content-item shape, shared by the house interior and the
  # daily brief.
  def content_item(item, user)
    st = user_state(item, user)
    {
      id: item.id,
      title: item.title,
      summary: item.summary,
      body: item.body,
      priority: item.priority,
      effective_from: item.effective_from,
      expires_at: item.expires_at,
      requires_ack: item.requires_ack,
      state: st&.state || "unread",
      opened_at: st&.opened_at,
      acknowledged_at: st&.acknowledged_at
    }
  end
end
