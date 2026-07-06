module Api
  module V1
    # Read side of the map contract (ADR-0004). The runtime loads a map by slug
    # and renders the baked artifact; there is no per-map branching here either,
    # this controller just returns "the map for this slug". Author CRUD and
    # access-policy gating arrive with the editor + Keycloak slices (#80+).
    class MapsController < BaseController
      # Authoring writes require the `admin` realm role (#100), as the other
      # mapper endpoints do; the play `show` stays open to any authenticated user.
      before_action -> { require_role!("admin") }, only: %i[index create update]

      # GET /api/v1/maps — identity-only list for the admin map picker (the author
      # picks a saved map to paint collision on). Deliberately omits the heavy
      # baked/source jsonb; the editor loads those per-map via `show`.
      def index
        maps = Map.order(:title).pluck(:slug, :title, :cols, :rows)
        render json: maps.map { |slug, title, cols, rows| { slug:, title:, cols:, rows: } }
      end

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

      # PATCH /api/v1/maps/:slug — re-save an authored map's decorations from the
      # standalone decorate editor (decoupled from create): the collision mask
      # (#131) and the placed props as object references (#139, ADR-0008). The
      # editor sends them under `baked` (the same opaque jsonb create stores); we
      # merge over the persisted baked so the ground/producer are untouched.
      def update
        map = Map.find_by!(slug: params[:slug])
        baked = (map.baked.is_a?(Hash) ? map.baked : {}).merge(update_params["baked"] || {})
        # Blank authored layers (cleared mask, no props) drop out so an
        # undecorated map's document stays clean.
        %w[collision entities].each { |k| baked.delete(k) if baked[k].blank? }
        map.update!(baked: baked)
        render json: MapSerializer.call(map)
      end

      private

      # Whitelist only the map's own columns; `source`/`baked` are opaque author
      # documents stored as jsonb, so permit their nested structure wholesale.
      def map_params
        params.permit(:slug, :title, :cols, :rows, source: {}, baked: {})
      end

      # The update path carries only the baked document (the re-painted mask).
      def update_params
        params.permit(baked: {}).to_h
      end
    end
  end
end
