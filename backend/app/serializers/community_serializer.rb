# Builds the GET /api/v1/communities/:id payload: the community header plus
# its three boards (always must_know, should_know, nice_to_know order) and
# their content items.
module CommunitySerializer
  module_function

  def call(community:, user:, now: Time.current)
    boards = community.boards.sort_by { |b| Serialization.board_order(b.board_type) }
    {
      community: {
        id: community.id,
        title: community.title,
        color: community.color,
        logo_url: community.logo_url,
        category_key: community.category_key,
        position_order: community.position_order,
        entry_gate: community.entry_gate
      },
      boards: boards.map { |b| board_payload(b, user, now) }
    }
  end

  def board_payload(board, user, now)
    items = board.content_items
                 .select { |ci| ci.effective?(now) }
                 .sort_by { |ci| [Serialization.priority_rank(ci.priority), -ci.id] }
    {
      id: board.id,
      board_type: board.board_type,
      content_items: items.map { |ci| Serialization.content_item(ci, user) }
    }
  end
end
