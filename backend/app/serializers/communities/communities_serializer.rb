module Communities
  # Builds the GET /api/v1/communities payload: a list of communities with
  # per-user badge counts and per-board summaries. No spatial / game concepts —
  # this surface is reusable by any UI (the village game, a list, a dashboard).
  module CommunitiesSerializer
    module_function

    def call(communities:, user:, now: Time.current)
      { communities: communities.map { |c| summary(c, user, now) } }
    end

    def summary(community, user, now)
      boards = community.boards.sort_by { |b| Serialization.board_order(b.board_type) }
      effective_by_board = boards.index_with do |b|
        b.content_items.select { |ci| ci.effective?(now) }
      end
      all_items = effective_by_board.values.flatten

      {
        id: community.id,
        title: community.title,
        color: community.color,
        logo_url: community.logo_url,
        category_key: community.category_key,
        position_order: community.position_order,
        # Gate type only (issue #24) — the door's posture_set_id stays server-side.
        entry_gate: community.entry_gate,
        # The authored interior Node the door portals into (#111); null = the
        # hardcoded InteriorScene.
        interior_node_slug: community.interior_node_slug,
        # The assigned mapped building for this house's hometown plot (#292);
        # null falls back to the active 'building' object, then bundled art.
        tile_object_id: community.tile_object_id,
        badges: {
          unread: all_items.count { |ci| state_of(ci, user) == "unread" },
          urgent: urgent_signage_count(effective_by_board, user),
          requires_ack: all_items.count { |ci|
            ci.requires_ack && state_of(ci, user) != "acknowledged"
          }
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

    # Urgent must-know items the user has not yet opened — drives the map
    # "!" badge when the village game UI consumes this.
    def urgent_signage_count(effective_by_board, user)
      entry = effective_by_board.find { |b, _| b.must_know? }
      return 0 unless entry

      entry.last.count { |ci| ci.urgent? && state_of(ci, user) == "unread" }
    end

    def state_of(item, user)
      Serialization.user_state(item, user)&.state || "unread"
    end
  end
end
