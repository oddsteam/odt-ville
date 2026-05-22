# Builds the GET /api/v1/village payload: the town map, per-house summary
# counts, the computed spawn point, and the Daily Brief fallback list.
module VillageSerializer
  module_function

  def call(company:, user:, houses:, now: Time.current)
    {
      company: { id: company.id, name: company.name },
      user: { id: user.id, name: user.name, role: user.role },
      last_location: Serialization.location(user.location_state),
      spawn: spawn_for(user, houses),
      houses: houses.map { |h| house_summary(h, user, now) },
      daily_brief: daily_brief(houses, user, now)
    }
  end

  # Returning user spawns near their last house if it is still active/visible;
  # otherwise (first-time visit, or the house was deleted/deactivated) the
  # frontend falls back to Town Entrance. Spawn is always on the town map —
  # the user is never dropped straight into a board.
  def spawn_for(user, houses)
    last_id = user.location_state.last_house_id
    target = last_id && houses.find { |h| h.id == last_id && h.active? }
    { area: "town", house_id: target&.id }
  end

  def house_summary(house, user, now)
    boards = house.boards.sort_by { |b| Serialization.board_order(b.board_type) }
    effective_by_board = boards.index_with do |b|
      b.content_items.select { |ci| ci.effective?(now) }
    end
    all_items = effective_by_board.values.flatten

    {
      id: house.id,
      title: house.title,
      color: house.color,
      logo_url: house.logo_url,
      category_key: house.category_key,
      position_order: house.position_order,
      unread_count: all_items.count { |ci| state_of(ci, user) == "unread" },
      urgent_count: urgent_signage_count(effective_by_board, user),
      requires_ack_count: all_items.count { |ci|
        ci.requires_ack && state_of(ci, user) != "acknowledged"
      },
      boards: boards.map { |b|
        items = effective_by_board[b]
        {
          board_type: b.board_type,
          item_count: items.size,
          unread_count: items.count { |ci| state_of(ci, user) == "unread" }
        }
      }
    }
  end

  # Drives the red "!" map badge: urgent Must Know items the user has not yet
  # opened. We never auto-open them — this is map signage only.
  def urgent_signage_count(effective_by_board, user)
    entry = effective_by_board.find { |b, _| b.must_know? }
    return 0 unless entry

    entry.last.count { |ci| ci.urgent? && state_of(ci, user) == "unread" }
  end

  # The fallback list mode: every effective Must Know item plus any urgent item,
  # so the playful map layer never blocks access to important content.
  def daily_brief(houses, user, now)
    rows = []
    houses.each do |house|
      house.boards.each do |board|
        board.content_items.each do |ci|
          next unless ci.effective?(now)
          next unless board.must_know? || ci.urgent?

          rows << Serialization.content_item(ci, user).merge(
            house_id: house.id,
            house_title: house.title,
            board_type: board.board_type
          )
        end
      end
    end
    rows.sort_by { |r| [Serialization.priority_rank(r[:priority]), r[:house_id], -r[:id]] }
  end

  def state_of(item, user)
    Serialization.user_state(item, user)&.state || "unread"
  end
end
