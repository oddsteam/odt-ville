require "test_helper"

module Api
  module V1
    class TileObjectsControllerTest < ActionDispatch::IntegrationTest
      setup do
        _, @user = setup_company
      end

      test "index returns roster summaries (no image blob), optionally filtered by kind" do
        ::Catalog::TileObject.create!(name: "Clump", kind: "flower-group", image: "data:img", footprint_w: 2, footprint_h: 2, active: true)
        ::Catalog::TileObject.create!(name: "Oak", kind: "tree", image: "data:img", active: true)

        get "/api/v1/tile_objects", params: { kind: "flower-group" }, headers: auth(@user)

        assert_response :success
        assert_equal ["Clump"], json.map { _1[:name] }
        assert_not json.first.key?(:image), "summary must omit the heavy image blob"
      end

      # Batched read (#138, ADR-0008): the shared entity loader fetches every
      # object a map references in one request, images included. A play-path
      # read, so any authenticated user — like show/active.
      test "index with ids returns the full objects (incl. image) for those ids, skipping unknown ids" do
        oak = ::Catalog::TileObject.create!(name: "Oak", kind: "tree", image: "data:oak", active: true)
        bush = ::Catalog::TileObject.create!(name: "Bush", kind: "prop", image: "data:bush", active: true)
        ::Catalog::TileObject.create!(name: "Unwanted", kind: "prop", image: "data:no", active: false)

        get "/api/v1/tile_objects", params: { ids: "#{oak.id},#{bush.id},999999" }, headers: auth(@user)

        assert_response :success
        assert_equal [oak.id, bush.id].sort, json.map { _1[:id] }.sort
        assert_equal %w[data:oak data:bush].sort, json.map { _1[:image] }.sort
      end

      test "a non-admin is forbidden from creating a tile object" do
        assert_no_difference -> { ::Catalog::TileObject.count } do
          post "/api/v1/tile_objects",
               params: { name: "Nope", kind: "tree", image: "data:img" },
               headers: auth(@user)
        end
        assert_response :forbidden
      end

      test "activate makes the object the only active one of its kind" do
        a = ::Catalog::TileObject.create!(name: "A", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: true)
        b = ::Catalog::TileObject.create!(name: "B", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: false)

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

      # Animated catalog art (ADR-0019, #435): a strip object is a tile object
      # carrying frame_count > 1. The three fields ride the *summary*, so the
      # decorate palette and the game's batched read both get them.
      test "create persists the animation fields and the roster carries them" do
        post "/api/v1/tile_objects",
             params: { name: "Spell Book", kind: "prop", image: "data:strip", footprint_w: 1, footprint_h: 2,
                       frame_count: 72, fps: 12, playback: "proximity" },
             headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal [72, 12, "proximity"], json.values_at(:frame_count, :fps, :playback)

        get "/api/v1/tile_objects", headers: auth(@user)
        assert_response :success
        assert_equal [72, 12, "proximity"], json.first.values_at(:frame_count, :fps, :playback)
      end

      test "an absent animation key keeps the stored strip, and a still object defaults to one looping frame" do
        obj = ::Catalog::TileObject.create!(name: "Spell Book", kind: "prop", image: "data:strip", frame_count: 72, fps: 12)

        post "/api/v1/tile_objects",
             params: { name: "Spell Book", kind: "prop", image: "data:strip2" },
             headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal [72, 12], [obj.reload.frame_count, obj.fps], "absent keys preserve the stored strip"

        still = ::Catalog::TileObject.create!(name: "Oak", kind: "tree", image: "i")
        assert_equal [1, nil, "loop"], [still.frame_count, still.fps, still.playback]
      end

      test "create persists the composition and show returns it, for remixing" do
        comp = {
          "v" => 1, "cell" => 32, "cols" => 2, "rows" => 1,
          "layers" => [{ "tiles" => [
            { "c" => 0, "r" => 0, "ts" => "buildings/5_Floor_Modular_Buildings_32x32", "i" => 1284 },
            { "c" => 1, "r" => 0, "ts" => "props/3_City_Props_32x32", "i" => 88 },
          ] }],
        }
        # as: :json so the opaque nested jsonb (numbers, arrays of hashes) survives
        # strong params unmangled — same as the maps `baked` create path.
        post "/api/v1/tile_objects",
             params: { name: "Bakery", kind: "building", image: "data:img", footprint_w: 2, footprint_h: 1, composition: comp },
             headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :success
        obj = ::Catalog::TileObject.find_by!(name: "Bakery")
        assert_equal comp, obj.composition, "the composition is stored beside the art"

        get "/api/v1/tile_objects/#{obj.id}", headers: auth(@user)
        assert_response :success
        assert_equal JSON.parse(comp.to_json, symbolize_names: true), json[:composition],
                     "show carries the composition so the mapper can reopen it"
      end

      test "an absent composition on re-save keeps the stored one, and defaults to {}" do
        comp = { "v" => 1, "cell" => 32, "cols" => 1, "rows" => 1,
                 "layers" => [{ "tiles" => [{ "c" => 0, "r" => 0, "ts" => "props/3_City_Props_32x32", "i" => 5 }] }] }
        obj = ::Catalog::TileObject.create!(name: "Sign", kind: "prop", image: "data:img", composition: comp)

        # A flat re-save (no composition key) must not clobber the recorded one.
        post "/api/v1/tile_objects",
             params: { name: "Sign", kind: "prop", image: "data:img2" },
             headers: auth(@user, roles: ["admin"])
        assert_response :success
        assert_equal comp, obj.reload.composition, "absent key preserves the stored composition"

        # A never-composed object defaults to {} — no composition.
        plain = ::Catalog::TileObject.create!(name: "Oak", kind: "tree", image: "data:img")
        assert_equal({}, plain.composition)
      end

      test "the composition stays off the roster and the game's batched/active reads" do
        comp = { "v" => 1, "cell" => 32, "cols" => 1, "rows" => 1,
                 "layers" => [{ "tiles" => [{ "c" => 0, "r" => 0, "ts" => "props/3_City_Props_32x32", "i" => 5 }] }] }
        obj = ::Catalog::TileObject.create!(name: "Kiosk", kind: "building", image: "data:img", composition: comp, active: true)

        get "/api/v1/tile_objects", headers: auth(@user)
        assert_response :success
        assert_not json.first.key?(:composition), "the roster stays light — no composition"

        get "/api/v1/tile_objects", params: { ids: obj.id.to_s }, headers: auth(@user)
        assert_response :success
        assert_not json.first.key?(:composition), "the game's batched read carries only art, not the rebuild note"

        get "/api/v1/tile_objects/active", params: { kind: "building" }, headers: auth(@user)
        assert_response :success
        assert_not json.key?(:composition), "the live object the game draws carries no composition"
      end

      test "show returns the full object including the image blob, for editing" do
        obj = ::Catalog::TileObject.create!(name: "Cottage", kind: "building", image: "data:img", footprint_w: 3, footprint_h: 4, door_dx: 1, door_dy: 3, walk_mask: "###\n#.#\n#.#\n#.#", active: true)

        get "/api/v1/tile_objects/#{obj.id}", headers: auth(@user)

        assert_response :success
        assert_equal obj.id, json[:id]
        assert_equal "data:img", json[:image], "show carries the image so the mapper can redraw the preview"
        assert_equal [1, 3], [json[:door_dx], json[:door_dy]]
        assert_equal ["###", "#.#", "#.#", "#.#"], json[:walk_mask]
      end

      test "deactivate turns the object off so its kind has no active object" do
        a = ::Catalog::TileObject.create!(name: "A", kind: "flower-group", image: "i", footprint_w: 2, footprint_h: 2, active: true)

        post "/api/v1/tile_objects/#{a.id}/deactivate", headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_not a.reload.active
        assert_nil ::Catalog::TileObject.current("flower-group"), "no active object of the kind remains"
      end

      test "destroy removes the object, leaving its kind with no active object" do
        a = ::Catalog::TileObject.create!(name: "Oak", kind: "tree", image: "i", footprint_w: 2, footprint_h: 2, active: true)

        delete "/api/v1/tile_objects/#{a.id}", headers: auth(@user, roles: ["admin"])

        assert_response :no_content
        assert_not ::Catalog::TileObject.exists?(a.id), "the object is gone"
        assert_nil ::Catalog::TileObject.current("tree"), "the kind falls back to the procedural default"
      end
    end
  end
end
