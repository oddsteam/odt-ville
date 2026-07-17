require "test_helper"

module Api
  module V1
    # Terrain priority catalog (#120): reads are open to any authenticated user;
    # reordering the stack is gated on the `admin` realm role, like the other
    # mapper writes.
    class TerrainsControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
        ::Catalog::Terrain.create!(name: "road", priority: 0)
        ::Catalog::Terrain.create!(name: "dirt", priority: 1)
        ::Catalog::Terrain.create!(name: "grass", priority: 2)
      end

      test "index returns terrains low->high priority for any authenticated user" do
        get "/api/v1/terrains", headers: auth(@user)
        assert_response :success
        body = JSON.parse(response.body)
        assert_equal %w[road dirt grass], body.map { |t| t["name"] }
        assert_equal [0, 1, 2], body.map { |t| t["priority"] }
      end

      test "an admin can reorder the priority stack" do
        put "/api/v1/terrains/order",
            params: { order: %w[grass dirt road] }, headers: auth(@user, roles: ["admin"])
        assert_response :success
        assert_equal %w[grass dirt road], ::Catalog::Terrain.ordered.pluck(:name)
      end

      test "a non-admin is forbidden from reordering" do
        put "/api/v1/terrains/order",
            params: { order: %w[grass dirt road] }, headers: auth(@user)
        assert_response :forbidden
        assert_equal %w[road dirt grass], ::Catalog::Terrain.ordered.pluck(:name)
      end

      test "tagging a new surface type registers it as a terrain at the top" do
        assert_difference "::Catalog::Terrain.count", 1 do
          post "/api/v1/ground_tiles",
               params: { tile_type: "lava", tileset: "Terra", col: 9, row: 9 },
               headers: auth(@user, roles: ["admin"])
        end
        assert_response :success
        # A brand-new terrain parks at the highest priority (top of the stack).
        assert_equal "lava", ::Catalog::Terrain.ordered.last.name
      end

      test "re-tagging a known surface type does not duplicate its terrain" do
        assert_no_difference "::Catalog::Terrain.count" do
          post "/api/v1/ground_tiles",
               params: { tile_type: "grass", tileset: "Terra", col: 1, row: 1 },
               headers: auth(@user, roles: ["admin"])
        end
        assert_response :success
        assert_equal 2, ::Catalog::Terrain.find_by(name: "grass").priority
      end
    end
  end
end
