module Api
  module V1
    # Read side of the map contract (ADR-0004). The runtime loads a map by slug
    # and renders the baked artifact; there is no per-map branching here either,
    # this controller just returns "the map for this slug". Author CRUD and
    # access-policy gating arrive with the editor + Keycloak slices (#80+).
    class MapsController < BaseController
      # Authoring writes require the `admin` realm role (#100), as the other
      # mapper endpoints do; the play `show` stays open to any authenticated user.
      before_action -> { require_role!("admin") }, only: :create

      # GET /api/v1/maps/:slug — the baked map for play. Unknown slug → 404,
      # surfaced by ApplicationController#render_not_found.
      def show
        map = Map.find_by!(slug: params[:slug])
        render json: MapSerializer.call(map)
      end

      # POST /api/v1/maps — persist an authored map from the editor (#105). The
      # editor bakes client-side (ADR-0003); we store `source` + `baked` verbatim
      # and only do cheap structural rejects via the model validations (dup slug,
      # blank slug/title, non-positive dims, malformed slug) — surfaced as 422 by
      # ApplicationController#render_invalid. Deeper playability checks are #82.
      def create
        map = Map.create!(map_params)
        render json: MapSerializer.call(map), status: :created
      end

      private

      # Whitelist only the map's own columns; `source`/`baked` are opaque author
      # documents stored as jsonb, so permit their nested structure wholesale.
      def map_params
        params.permit(:slug, :title, :cols, :rows, source: {}, baked: {})
      end
    end
  end
end
