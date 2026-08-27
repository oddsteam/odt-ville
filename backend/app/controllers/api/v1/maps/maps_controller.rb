module Api
  module V1
    module Maps
      # Read side of the map contract (ADR-0004). The runtime loads a map by slug
      # and renders the baked artifact; there is no per-map branching here either,
      # this controller just returns "the map for this slug". List and load are
      # gated by the map's access policy (#83) — server-side, no client hiding.
      #
      # Leading-colon `::Maps::` refs jump to the domain module — inside
      # Api::V1::Maps a bare `Maps` would resolve to this controller namespace.
      class MapsController < BaseController
        # Authoring writes require the `admin` realm role (#100), as the other
        # mapper endpoints do; the reads are per-user via the access policy.
        before_action -> { require_role!("admin") }, only: %i[create update destroy]

        # GET /api/v1/maps — identity-only list of the maps this user may access
        # (map picker, portal targets). Deliberately omits the heavy baked/source
        # jsonb; the editor loads those per-map via `show`.
        def index
          maps = ::Maps::Map.order(:title)
            .select(:id, :slug, :title, :cols, :rows, :access_policy)
            .select { |m| accessible?(m) }
          render json: maps.map { |m| { slug: m.slug, title: m.title, cols: m.cols, rows: m.rows } }
        end

        # GET /api/v1/maps/:slug — the baked map for play. Unknown slug → 404,
        # surfaced by ApplicationController#render_not_found; gated slug → 403.
        def show
          map = ::Maps::Map.find_by!(slug: params[:slug])
          return render json: { error: "Forbidden" }, status: :forbidden unless accessible?(map)

          render json: ::Maps::MapSerializer.call(map)
        end

        # POST /api/v1/maps — persist an authored map from the editor (#105). The
        # editor bakes client-side (ADR-0003); we store `source` + `baked` verbatim
        # and only do cheap structural rejects via the model validations (dup slug,
        # blank slug/title, non-positive dims, malformed slug) — surfaced as 422 by
        # ApplicationController#render_invalid. Deeper playability checks are #82.
        def create
          map = ::Maps::Map.create!(map_params)
          render json: ::Maps::MapSerializer.call(map), status: :created
        end

        # PATCH /api/v1/maps/:slug — re-save an authored map's decorations from the
        # standalone decorate editor (decoupled from create): the collision mask
        # (#131) and the placed props as object references (#139, ADR-0008). The
        # editor sends them under `baked` (the same opaque jsonb create stores); we
        # merge over the persisted baked so the ground/producer are untouched.
        # The map settings (#91) — `multiplayer` and the access policy, both Node
        # properties (ADR-0005) — ride the same PATCH as plain columns; a bad
        # policy is rejected by the model validation as 422.
        def update
          map = ::Maps::Map.find_by!(slug: params[:slug])
          attrs = update_params.slice("multiplayer", "access_policy")
          if update_params.key?("baked")
            baked = (map.baked.is_a?(Hash) ? map.baked : {}).merge(update_params["baked"] || {})
            # Blank authored layers (cleared mask, no props, no zones) drop out so
            # an undecorated map's document stays clean.
            %w[collision entities zones].each { |k| baked.delete(k) if baked[k].blank? }
            attrs["baked"] = baked
          end
          map.update!(attrs)
          render json: ::Maps::MapSerializer.call(map)
        end

        # DELETE /api/v1/maps/:slug — remove a saved map outright. Memberships
        # delete via the model, standees via the DB cascade; unknown slug → 404.
        def destroy
          ::Maps::Map.find_by!(slug: params[:slug]).destroy!
          head :no_content
        end

        private

        # The access gate (#83) — also the future multiplayer room-join gate.
        def accessible?(map)
          map.accessible_to?(current_user, roles: current_roles, groups: current_groups)
        end

        # Whitelist only the map's own columns; `source`/`baked` are opaque author
        # documents stored as jsonb, so permit their nested structure wholesale.
        def map_params
          params.permit(:slug, :title, :cols, :rows, source: {}, baked: {})
        end

        # The update path: the baked document (the re-painted mask) and/or the
        # map settings (#91).
        def update_params
          params.permit(:multiplayer, access_policy: {}, baked: {}).to_h
        end
      end
    end
  end
end
