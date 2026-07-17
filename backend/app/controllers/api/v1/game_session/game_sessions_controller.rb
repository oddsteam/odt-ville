module Api
  module V1
    module GameSession
      # Leading-colon `::GameSession::` refs jump to the domain module — inside
      # Api::V1::GameSession a bare `GameSession` would resolve here instead.
      class GameSessionsController < BaseController
        AREAS = %w[town house].freeze

        # GET /api/v1/game/session — the village game asks here for its spawn.
        def show
          render json: ::GameSession::GameSessionSerializer.call(user: current_user)
        end

        # PUT /api/v1/game/session — persist only the coarse location
        # (area / last_community / last_room — never x/y).
        def update
          loc = current_user.location_state

          area = params[:last_area].to_s
          area = loc.last_area unless AREAS.include?(area)

          # Keep last_community_id only if it still resolves to an active
          # community in this company.
          cid = params[:last_community_id].presence
          unless cid && current_user.company.houses.active.exists?(id: cid)
            cid = nil
          end

          loc.update!(
            last_area: area,
            last_house_id: cid,
            last_room: params[:last_room].presence
          )

          render json: ::GameSession::GameSessionSerializer.call(user: current_user)
        end
      end
    end
  end
end
