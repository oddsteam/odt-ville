module Api
  module V1
    # Read side of the map contract (ADR-0004). The runtime loads a map by slug
    # and renders the baked artifact; there is no per-map branching here either,
    # this controller just returns "the map for this slug". Author CRUD and
    # access-policy gating arrive with the editor + Keycloak slices (#80+).
    class MapsController < BaseController
      # GET /api/v1/maps/:slug — the baked map for play. Unknown slug → 404,
      # surfaced by ApplicationController#render_not_found.
      def show
        map = Map.find_by!(slug: params[:slug])
        render json: MapSerializer.call(map)
      end
    end
  end
end
