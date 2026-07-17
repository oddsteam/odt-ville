require "test_helper"

module Api
  module V1
    # Ground-tile authoring is gated on the `admin` realm role (#100): reads are
    # open to any authenticated user, writes require admin.
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

      test "an admin can create a ground tile" do
        assert_difference "::Catalog::GroundTile.count", 1 do
          post "/api/v1/ground_tiles", params: tile_params, headers: auth(@user, roles: ["admin"])
        end
        assert_response :success
      end

      test "a non-admin is forbidden from creating a ground tile" do
        assert_no_difference "::Catalog::GroundTile.count" do
          post "/api/v1/ground_tiles", params: tile_params, headers: auth(@user)
        end
        assert_response :forbidden
      end

      test "a non-admin is forbidden from deleting a ground tile" do
        tile = ::Catalog::GroundTile.create!(tile_type: "grass", tileset: "Terrains", col: 3, row: 4, cell: 32, role: "fill")
        delete "/api/v1/ground_tiles/#{tile.id}", headers: auth(@user)
        assert_response :forbidden
        assert ::Catalog::GroundTile.exists?(tile.id)
      end
    end
  end
end
