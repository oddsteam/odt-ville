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

      # Batched read (#138, ADR-0008): the shared entity loader fetches every
      # object a map references in one request, images included. A play-path
      # read, so any authenticated user — like show/active.
      test "index with ids returns the full objects (incl. image) for those ids, skipping unknown ids" do
        oak = TileObject.create!(name: "Oak", kind: "tree", image: "data:oak", active: true)
        bush = TileObject.create!(name: "Bush", kind: "prop", image: "data:bush", active: true)
        TileObject.create!(name: "Unwanted", kind: "prop", image: "data:no", active: false)

        get "/api/v1/tile_objects", params: { ids: "#{oak.id},#{bush.id},999999" }, headers: auth(@user)

        assert_response :success
        assert_equal [oak.id, bush.id].sort, json.map { _1[:id] }.sort
        assert_equal %w[data:oak data:bush].sort, json.map { _1[:image] }.sort
      end

      test "a non-admin is forbidden from creating a tile object" do
        assert_no_difference -> { TileObject.count } do
          post "/api/v1/tile_objects",
               params: { name: "Nope", kind: "tree", image: "data:img" },
               headers: auth(@user)
        end
        assert_response :forbidden
      end

      test "activate makes the object the only active one of its kind" do
        a = TileObject.create!(name: "A", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: true)
        b = TileObject.create!(name: "B", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: false)

        post "/api/v1/tile_objects/#{b.id}/activate", headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal b.id, json[:id]
        assert b.reload.active, "target becomes active"
        assert_not a.reload.active, "sibling of the same kind is deactivated"
      end

      test "create persists a building door anchor and active returns it" do
        post "/api/v1/tile_objects",
             params: { name: "Cottage", kind: "building", image: "data:img", footprint_w: 3, footprint_h: 4, door_dx: 0, door_dy: 1 },
             headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal 0, json[:door_dx]
        assert_equal 1, json[:door_dy]

        get "/api/v1/tile_objects/active", params: { kind: "building" }, headers: auth(@user)
        assert_response :success
        assert_equal [0, 1], [json[:door_dx], json[:door_dy]]
      end

      test "create persists an interior walk mask, round-tripped as rows" do
        mask = ["###", "#.#", "#.#", "#.#"]
        post "/api/v1/tile_objects",
             params: { name: "Cottage", kind: "building", image: "data:img", footprint_w: 3, footprint_h: 4, door_dx: 1, door_dy: 3, walk_mask: mask },
             headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal mask, json[:walk_mask]

        get "/api/v1/tile_objects/active", params: { kind: "building" }, headers: auth(@user)
        assert_response :success
        assert_equal mask, json[:walk_mask]
      end

      test "create persists impassable cell borders, round-tripped as rows" do
        edges = ["000", "0c0", "000", "000"]
        post "/api/v1/tile_objects",
             params: { name: "Cottage", kind: "building", image: "data:img", footprint_w: 3, footprint_h: 4, door_dx: 1, door_dy: 3, walk_mask: ["###", "#.#", "#.#", "#.#"], edge_mask: edges },
             headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal edges, json[:edge_mask]

        get "/api/v1/tile_objects/active", params: { kind: "building" }, headers: auth(@user)
        assert_response :success
        assert_equal edges, json[:edge_mask]
      end

      test "create persists a foreground mask, round-tripped on the full object" do
        fg = "data:image/png;base64,maskblob"
        post "/api/v1/tile_objects",
             params: { name: "Cottage", kind: "building", image: "data:img", footprint_w: 3, footprint_h: 4, door_dx: 1, door_dy: 3, walk_mask: ["###", "#.#", "#.#", "#.#"], fg_mask: fg },
             headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal fg, json[:fg_mask]

        get "/api/v1/tile_objects/active", params: { kind: "building" }, headers: auth(@user)
        assert_response :success
        assert_equal fg, json[:fg_mask]
      end

      test "show returns the full object including the image blob, for editing" do
        obj = TileObject.create!(name: "Cottage", kind: "building", image: "data:img", footprint_w: 3, footprint_h: 4, door_dx: 1, door_dy: 3, walk_mask: "###\n#.#\n#.#\n#.#", active: true)

        get "/api/v1/tile_objects/#{obj.id}", headers: auth(@user)

        assert_response :success
        assert_equal obj.id, json[:id]
        assert_equal "data:img", json[:image], "show carries the image so the mapper can redraw the preview"
        assert_equal [1, 3], [json[:door_dx], json[:door_dy]]
        assert_equal ["###", "#.#", "#.#", "#.#"], json[:walk_mask]
      end

      test "deactivate turns the object off so its kind has no active object" do
        a = TileObject.create!(name: "A", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: true)

        post "/api/v1/tile_objects/#{a.id}/deactivate", headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_not a.reload.active
        assert_nil TileObject.current("flower-group"), "no active object of the kind remains"
      end

      test "destroy removes the object, leaving its kind with no active object" do
        a = TileObject.create!(name: "Oak", kind: "tree", image: "i", footprint_w: 2, footprint_h: 2, active: true)

        delete "/api/v1/tile_objects/#{a.id}", headers: auth(@user, roles: ["admin"])

        assert_response :no_content
        assert_not TileObject.exists?(a.id), "the object is gone"
        assert_nil TileObject.current("tree"), "the kind falls back to the procedural default"
      end
    end
  end
end
