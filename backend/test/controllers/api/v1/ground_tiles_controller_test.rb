require "test_helper"

module Api
  module V1
    # Ground-tile authoring is gated on the `editor` realm role (#94): reads are
    # open to any authenticated user, writes require editor.
    class GroundTilesControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
      end

      def tile_params
        { tile_type: "grass", tileset: "Terrains", col: 1, row: 2 }
      end

      test "index is readable by any authenticated user" do
        get "/api/v1/ground_tiles", headers: auth(@user)
        assert_response :success
      end

      test "an editor can create a ground tile" do
        assert_difference "GroundTile.count", 1 do
          post "/api/v1/ground_tiles", params: tile_params, headers: auth(@user, roles: ["editor"])
        end
        assert_response :success
      end

      test "a non-editor is forbidden from creating a ground tile" do
        assert_no_difference "GroundTile.count" do
          post "/api/v1/ground_tiles", params: tile_params, headers: auth(@user)
        end
        assert_response :forbidden
      end

      test "a non-editor is forbidden from deleting a ground tile" do
        tile = GroundTile.create!(tile_type: "grass", tileset: "Terrains", col: 3, row: 4, cell: 32, role: "fill")
        delete "/api/v1/ground_tiles/#{tile.id}", headers: auth(@user)
        assert_response :forbidden
        assert GroundTile.exists?(tile.id)
      end
    end
  end
end
