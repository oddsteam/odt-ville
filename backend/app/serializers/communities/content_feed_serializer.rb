module Communities
  # Builds the GET /api/v1/content_items/feed payload: every effective Must
  # Know item plus any urgent item across all communities, priority-sorted.
  # The flat "what matters today" feed — usable by any UI, no village shape.
  module ContentFeedSerializer
    module_function

    def call(communities:, user:, now: Time.current)
      rows = []
      communities.each do |community|
        community.boards.each do |board|
          board.content_items.each do |ci|
            next unless ci.effective?(now)
            next unless board.must_know? || ci.urgent?

            rows << Serialization.content_item(ci, user).merge(
              community_id: community.id,
              community_title: community.title,
              board_type: board.board_type
            )
          end
        end
      end
      {
        items: rows.sort_by { |r|
          [Serialization.priority_rank(r[:priority]), r[:community_id], -r[:id]]
        }
      }
    end
  end
end
