# Builds the GET /api/v1/houses/:id payload: the house header plus its three
# boards (always must_know, should_know, nice_to_know order) and their items.
module HouseSerializer
  module_function

  def call(house:, user:, now: Time.current)
    boards = house.boards.sort_by { |b| Serialization.board_order(b.board_type) }
    {
      house: {
        id: house.id,
        title: house.title,
        color: house.color,
        logo_url: house.logo_url,
        category_key: house.category_key,
        position_order: house.position_order
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
