module Api
  module V1
    class TileObjectsController < BaseController
      # GET /api/v1/tile_objects — roster (no image blobs). Optional ?kind=.
      def index
        scope = TileObject.order(:kind, :name)
        scope = scope.where(kind: params[:kind]) if params[:kind].present?
        render json: scope.map { |o| TileObjectSerializer.summary(o) }
      end

      # GET /api/v1/tile_objects/:id — the full object (incl. image) so the
      # mapper can load a saved object back into the editor to add/adjust its
      # door anchor or interior walk mask.
      def show
        obj = TileObject.find(params[:id])
        render json: TileObjectSerializer.call(obj)
      end

      # GET /api/v1/tile_objects/active?kind=tree — the live object of a kind
      # the game renders. 204 when none is active yet.
      def active
        kind = params[:kind].presence || "tree"
        obj = TileObject.current(kind)
        return head :no_content unless obj

        render json: TileObjectSerializer.call(obj)
      end

      # POST /api/v1/tile_objects — save from the tile-object mapper. Upserts by
      # name and, unless active:false, makes it the live object of its kind.
      def create
        name = params[:name].to_s.strip
        if name.blank? || params[:image].blank?
          return render json: { error: "name and image are required" },
                        status: :unprocessable_entity
        end

        obj = TileObject.find_or_initialize_by(name: name)
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
          walk_mask: params.key?(:walk_mask) ? Array(params[:walk_mask]).join("\n") : obj.walk_mask
        )
        obj.save!
        obj.activate! unless params[:active] == false

        render json: TileObjectSerializer.call(obj.reload)
      end

      # PATCH /api/v1/tile_objects/:id/activate — make an existing object the
      # live one of its kind (the mapper's saved-objects list uses this to swap
      # which flower-group/single/tree the game renders).
      def activate
        obj = TileObject.find(params[:id])
        obj.activate!
        render json: TileObjectSerializer.summary(obj.reload)
      end

      # POST /api/v1/tile_objects/:id/deactivate — turn this object off so its
      # kind has no live object and the game falls back to its procedural
      # default (e.g. the flower scatter reverts to the bundled buds).
      def deactivate
        obj = TileObject.find(params[:id])
        obj.update!(active: false)
        render json: TileObjectSerializer.summary(obj.reload)
      end

      # DELETE /api/v1/tile_objects/:id — drop a saved object for good. If it was
      # the active one of its kind, that kind simply has no live object left and
      # the game falls back to its procedural default (same as deactivate).
      def destroy
        TileObject.find(params[:id]).destroy!
        head :no_content
      end
    end
  end
end
