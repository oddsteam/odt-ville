require "test_helper"

module Api
  module V1
    class TileObjectsControllerTest < ActionDispatch::IntegrationTest
      setup do
        _, @user = setup_company
      end

      test "index returns roster summaries (no image blob), optionally filtered by kind" do
        TileObject.create!(name: "Clump", kind: "flower-group", image: "data:img", footprint_w: 2, footprint_h: 2, active: true)
        TileObject.create!(name: "Oak", kind: "tree", image: "data:img", active: true)

        get "/api/v1/tile_objects", params: { kind: "flower-group" }, headers: auth(@user)

        assert_response :success
        assert_equal ["Clump"], json.map { _1[:name] }
        assert_not json.first.key?(:image), "summary must omit the heavy image blob"
      end

      test "activate makes the object the only active one of its kind" do
        a = TileObject.create!(name: "A", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: true)
        b = TileObject.create!(name: "B", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: false)

        post "/api/v1/tile_objects/#{b.id}/activate", headers: auth(@user)

        assert_response :success
        assert_equal b.id, json[:id]
        assert b.reload.active, "target becomes active"
        assert_not a.reload.active, "sibling of the same kind is deactivated"
      end

      test "create persists a building door anchor and active returns it" do
        post "/api/v1/tile_objects",
             params: { name: "Cottage", kind: "building", image: "data:img", footprint_w: 3, footprint_h: 4, door_dx: 0, door_dy: 1 },
             headers: auth(@user)

        assert_response :success
        assert_equal 0, json[:door_dx]
        assert_equal 1, json[:door_dy]

        get "/api/v1/tile_objects/active", params: { kind: "building" }, headers: auth(@user)
        assert_response :success
        assert_equal [0, 1], [json[:door_dx], json[:door_dy]]
      end

      test "deactivate turns the object off so its kind has no active object" do
        a = TileObject.create!(name: "A", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: true)

        post "/api/v1/tile_objects/#{a.id}/deactivate", headers: auth(@user)

        assert_response :success
        assert_not a.reload.active
        assert_nil TileObject.current("flower-group"), "no active object of the kind remains"
      end
    end
  end
end
