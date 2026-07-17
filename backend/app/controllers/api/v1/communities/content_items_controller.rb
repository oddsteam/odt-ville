module Api
  module V1
    module Communities
      # Content-item read/ack state + the daily-brief feed (ADR-0010). Nested
      # under Api::V1::Communities::; URLs unchanged via `scope module:`. The
      # `::Communities::` refs are leading-colon so they reach the domain module,
      # not this controller namespace.
      class ContentItemsController < BaseController
        # GET /api/v1/content_items/feed
        # The "Daily Brief" shape — must-know + urgent items across every
        # community, priority-sorted. Decoupled from any village payload so any
        # UI (game, list, dashboard, bot) can consume the same feed.
        def feed
          communities = current_user.company.houses.active.ordered
                                    .includes(boards: { content_items: :user_content_states })
                                    .to_a
          render json: ::Communities::ContentFeedSerializer.call(
            communities: communities, user: current_user, now: Time.current
          )
        end

        # POST /api/v1/content_items/:id/open
        # Marks an item opened. Already-opened / acknowledged items are untouched.
        def open
          item = find_item
          state = state_for(item)
          if state.unread?
            state.state = "opened"
            state.opened_at ||= Time.current
          end
          state.save!
          render json: state_json(item, state)
        end

        # POST /api/v1/content_items/:id/acknowledge
        # Marks an item acknowledged (implies it was also opened).
        def acknowledge
          item = find_item
          state = state_for(item)
          state.state = "acknowledged"
          state.opened_at ||= Time.current
          state.acknowledged_at ||= Time.current
          state.save!
          render json: state_json(item, state)
        end

        private

        # Scoped to the current user's company so ids from other companies 404.
        def find_item
          ::Communities::ContentItem.joins(board: :house)
                                    .where(houses: { company_id: current_user.company_id })
                                    .find(params[:id])
        end

        def state_for(item)
          current_user.user_content_states.find_or_initialize_by(content_item: item)
        end

        def state_json(item, state)
          {
            id: item.id,
            state: state.state,
            opened_at: state.opened_at,
            acknowledged_at: state.acknowledged_at
          }
        end
      end
    end
  end
end
