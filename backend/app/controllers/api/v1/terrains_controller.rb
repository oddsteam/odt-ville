module Api
  module V1
    # Terrain priority catalog (#120). Priority is the seam-ownership order both
    # ground producers (the generated town + the authored-map editor) read to
    # build their Tile Catalog stack. Reads are open to any authenticated user;
    # reordering requires the `admin` realm role, like the other mapper writes.
    class TerrainsController < BaseController
      before_action -> { require_role!("admin") }, only: :reorder

      # GET /api/v1/terrains — terrains low→high priority.
      def index
        render json: Terrain.ordered.map { |t| TerrainSerializer.call(t) }
      end

      # PUT /api/v1/terrains/order — set the whole priority order from an ordered
      # name list (low→high). Flipping the order here flips seam ownership in the
      # editor's WYSIWYG preview and at /maps/<slug>, no code change.
      def reorder
        Terrain.reorder!(params[:order])
        render json: Terrain.ordered.map { |t| TerrainSerializer.call(t) }
      end
    end
  end
end
