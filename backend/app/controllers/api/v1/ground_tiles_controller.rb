module Api
  module V1
    class GroundTilesController < BaseController
      # GET /api/v1/ground_tiles — the ground-tile catalog. Optional ?type=.
      def index
        scope = GroundTile.order(:tile_type, :tileset, :row, :col)
        scope = scope.where(tile_type: params[:type]) if params[:type].present?
        render json: scope.map { |t| GroundTileSerializer.call(t) }
      end

      # POST /api/v1/ground_tiles — tag one atlas cell with a ground type.
      # Upserts by (tileset, col, row): re-tagging a cell changes its type.
      def create
        type = params[:tile_type].to_s.strip
        tileset = params[:tileset].to_s.strip
        if type.blank? || tileset.blank? || params[:col].blank? || params[:row].blank?
          return render json: { error: "tile_type, tileset, col and row are required" },
                        status: :unprocessable_entity
        end

        tile = GroundTile.find_or_initialize_by(
          tileset: tileset, col: params[:col].to_i, row: params[:row].to_i
        )
        role = params[:role].presence || "fill"
        tile.assign_attributes(
          tile_type: type,
          cell: params[:cell].presence || tile.cell || 32,
          label: params[:label].to_s,
          role: role,
          # Side is meaningful only for edge tiles; a fill tile clears it.
          side: role == "edge" ? params[:side].presence : nil
        )
        tile.save!

        render json: GroundTileSerializer.call(tile)
      end

      # DELETE /api/v1/ground_tiles/:id — drop a tile from the catalog.
      def destroy
        GroundTile.find(params[:id]).destroy!
        head :no_content
      end
    end
  end
end
