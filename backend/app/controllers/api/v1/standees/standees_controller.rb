module Api
  module V1
    module Standees
      # The Standees runtime contract (#369, ADR-0015). Standees are NOT baked
      # into the map document — they are read alongside it here, and deployed by
      # a durable write. Both endpoints are scoped to a map by slug and inherit
      # that map's own access gate (the same #83 policy the map load uses); there
      # is no per-target authorization (#279 — roles live in the caller's JWT,
      # not our DB, so the server cannot authorize on another user's behalf).
      #
      # Leading-colon `::Standees::` reaches the domain module — inside
      # Api::V1::Standees a bare `Standees` would resolve to this namespace.
      class StandeesController < BaseController
        before_action :load_map, only: [:index, :create]

        # GET /api/v1/maps/:slug/standees — the Standees standing on this map.
        # Queried by map_id rather than through a reverse association, so the
        # dependency runs one way (Standees → Maps), never back.
        def index
          standees = ::Standees::Standee.where(map_id: @map.id)
                                        .includes(user: :character_manifest).order(:id)
          render json: standees.map { |s| ::Standees::StandeeSerializer.call(s) }
        end

        # POST /api/v1/maps/:slug/standees — deploy a Standee at the caller's
        # current cell. The server can't know where the avatar stands (position
        # is ephemeral, never persisted), so the client sends the cell it is on.
        # Refused on a solo map: a generated hometown has an audience of one, so
        # a Standee there would be seen by nobody (ADR-0015).
        def create
          unless @map.multiplayer?
            return render json: { error: "Standees can only be deployed on a multiplayer map" },
                          status: :unprocessable_entity
          end

          # The world-wide budget of 3 (#371): at the cap the deploy is refused
          # with a pointer to the Standees already out — never a silent replace.
          budget = ::Standees::Budget.for(current_user)
          unless budget.allows?
            return render json: { error: budget.refusal }, status: :unprocessable_entity
          end

          standee = ::Standees::Standee.create!(
            map: @map,
            user: current_user,
            cell_x: deploy_params[:x],
            cell_y: deploy_params[:y],
            message: deploy_params[:message],
            detail: deploy_params[:detail]
          )
          render json: ::Standees::StandeeSerializer.call(standee), status: :created
        end

        # GET /api/v1/standees/mine — the caller's Standees across every map,
        # with the world-wide cap and the count already out (#371). Feeds the
        # deploy affordance's "N of 3 out" before the employee writes anything,
        # so they are never asked to fill in a form they cannot submit. Not
        # scoped to a map, so it skips `load_map`.
        def mine
          budget = ::Standees::Budget.for(current_user)
          render json: {
            cap: ::Standees::Budget::CAP,
            out: budget.out,
            standees: budget.standees.map { |s| ::Standees::StandeeSerializer.mine(s) }
          }
        end

        private

        def load_map
          @map = ::Maps::Map.find_by!(slug: params[:slug])
          return if @map.accessible_to?(current_user, roles: current_roles, groups: current_groups)

          render json: { error: "Forbidden" }, status: :forbidden
        end

        def deploy_params
          params.permit(:x, :y, :message, :detail)
        end
      end
    end
  end
end
