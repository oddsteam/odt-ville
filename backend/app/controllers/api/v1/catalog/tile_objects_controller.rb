module Api
  module V1
    module Catalog
      class TileObjectsController < BaseController
        # Authoring writes require the `admin` realm role (#100); reads stay open.
        before_action -> { require_role!("admin") },
          only: %i[create activate deactivate destroy]

        # GET /api/v1/tile_objects — roster (no image blobs). Optional ?kind=.
        # With ?ids=1,2,3 (#138, ADR-0008): the FULL objects (incl. image) for
        # those ids, unknown ids skipped — the one batched request the shared
        # entity loader makes for every object a map references.
        def index
          if params[:ids].present?
            ids = params[:ids].split(",").map(&:to_i)
            return render json: ::Catalog::TileObject.where(id: ids).map { |o| ::Catalog::TileObjectSerializer.call(o) }
          end
          scope = ::Catalog::TileObject.order(:kind, :name)
          scope = scope.where(kind: params[:kind]) if params[:kind].present?
          render json: scope.map { |o| ::Catalog::TileObjectSerializer.summary(o) }
        end

        # GET /api/v1/tile_objects/:id — the full object (incl. image) so the
        # mapper can load a saved object back into the editor to add/adjust its
        # door anchor or interior walk mask.
        def show
          obj = ::Catalog::TileObject.find(params[:id])
          render json: ::Catalog::TileObjectSerializer.detail(obj)
        end

        # GET /api/v1/tile_objects/active?kind=tree — the live object of a kind
        # the game renders. 204 when none is active yet.
        def active
          kind = params[:kind].presence || "tree"
          obj = ::Catalog::TileObject.current(kind)
          return head :no_content unless obj

          render json: ::Catalog::TileObjectSerializer.call(obj)
        end

        # POST /api/v1/tile_objects — save from the tile-object mapper. Upserts by
        # name and, unless active:false, makes it the live object of its kind.
        def create
          name = params[:name].to_s.strip
          if name.blank? || params[:image].blank?
            return render json: { error: "name and image are required" },
                          status: :unprocessable_entity
          end

          obj = ::Catalog::TileObject.find_or_initialize_by(name: name)
          obj.assign_attributes(
            kind: params[:kind].presence || obj.kind || "prop",
            image: params[:image],
            footprint_w: params[:footprint_w].presence || obj.footprint_w || 1,
            footprint_h: params[:footprint_h].presence || obj.footprint_h || 1,
            # Door anchor — only authored for "building" objects; nil otherwise.
            door_dx: params.key?(:door_dx) ? params[:door_dx] : obj.door_dx,
            door_dy: params.key?(:door_dy) ? params[:door_dy] : obj.door_dy,
            # Interior walk mask (#32) — a row-major array of strings from the
            # mapper, stored newline-joined. Only authored for buildings.
            walk_mask: params.key?(:walk_mask) ? Array(params[:walk_mask]).join("\n") : obj.walk_mask,
            # Impassable cell borders (#53) — a row-major array of hex-digit rows
            # from the mapper, stored newline-joined. Only authored for buildings.
            edge_mask: params.key?(:edge_mask) ? Array(params[:edge_mask]).join("\n") : obj.edge_mask,
            # Foreground mask (#36) — a PNG data URL marking which house pixels
            # render over the avatar. Stored as-is; only authored for buildings.
            fg_mask: params.key?(:fg_mask) ? params[:fg_mask] : obj.fg_mask,
            # Composition (#355, ADR-0014) — the editor-only rebuild note. An
            # opaque jsonb document, so permit its nested structure wholesale;
            # absent key keeps the stored composition, so re-saving a flat object
            # (no composition sent) never clobbers one already recorded.
            composition: params.key?(:composition) ? params.permit(composition: {})[:composition].to_h : obj.composition,
            # Animated art (#435, ADR-0019) — a frame strip in `image` plus how
            # to play it. Absent keys keep the stored values, so a re-save from
            # a still-only editor never flattens an animated object.
            frame_count: params.key?(:frame_count) ? params[:frame_count] : obj.frame_count,
            fps: params.key?(:fps) ? params[:fps] : obj.fps,
            playback: params.key?(:playback) ? params[:playback] : obj.playback
          )
          obj.save!
          obj.activate! unless params[:active] == false

          render json: ::Catalog::TileObjectSerializer.call(obj.reload)
        end

        # PATCH /api/v1/tile_objects/:id/activate — make an existing object the
        # live one of its kind (the mapper's saved-objects list uses this to swap
        # which flower-group/single/tree the game renders).
        def activate
          obj = ::Catalog::TileObject.find(params[:id])
          obj.activate!
          render json: ::Catalog::TileObjectSerializer.summary(obj.reload)
        end

        # POST /api/v1/tile_objects/:id/deactivate — turn this object off so its
        # kind has no live object and the game falls back to its procedural
        # default (e.g. the flower scatter reverts to the bundled buds).
        def deactivate
          obj = ::Catalog::TileObject.find(params[:id])
          obj.update!(active: false)
          render json: ::Catalog::TileObjectSerializer.summary(obj.reload)
        end

        # DELETE /api/v1/tile_objects/:id — drop a saved object for good. If it was
        # the active one of its kind, that kind simply has no live object left and
        # the game falls back to its procedural default (same as deactivate).
        def destroy
          ::Catalog::TileObject.find(params[:id]).destroy!
          head :no_content
        end
      end
    end
  end
end
