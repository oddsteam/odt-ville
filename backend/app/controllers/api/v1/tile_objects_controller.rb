module Api
  module V1
    class TileObjectsController < BaseController
      # GET /api/v1/tile_objects — roster (no image blobs). Optional ?kind=.
      def index
        scope = TileObject.order(:kind, :name)
        scope = scope.where(kind: params[:kind]) if params[:kind].present?
        render json: scope.map { |o| TileObjectSerializer.summary(o) }
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
          footprint_h: params[:footprint_h].presence || obj.footprint_h || 1
        )
        obj.save!
        obj.activate! unless params[:active] == false

        render json: TileObjectSerializer.call(obj.reload)
      end
    end
  end
end
