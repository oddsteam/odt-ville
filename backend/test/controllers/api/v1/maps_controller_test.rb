require "test_helper"

module Api
  module V1
    class MapsControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
      end

      # A minimal baked authored map: a 1x1 grass grid plus one prop. Mirrors the
      # seed fixture's shape so the request spec pins the contract MapSerializer
      # publishes.
      def make_map(slug: "atrium", title: "The Atrium")
        Map.create!(
          slug: slug,
          title: title,
          cols: 1,
          rows: 1,
          baked: {
            "tilesets" => [{ "name" => "1_Terrains_and_Fences_32x32", "cell" => 32 }],
            "tiles" => [[{ "tileset" => "1_Terrains_and_Fences_32x32", "frame" => 0 }]],
            "entities" => [
              { "kind" => "prop", "tileset" => "1_Terrains_and_Fences_32x32", "frame" => 5, "x" => 0, "y" => 0 }
            ]
          }
        )
      end

      test "show returns the baked map for a known slug" do
        make_map

        get "/api/v1/maps/atrium", headers: auth(@user)

        assert_response :success
        body = json
        assert_equal "atrium", body[:slug]
        assert_equal "The Atrium", body[:title]
        assert_equal 1, body[:cols]
        assert_equal 1, body[:rows]
        assert_equal [{ name: "1_Terrains_and_Fences_32x32", cell: 32 }], body[:tilesets]
        assert_equal [[{ tileset: "1_Terrains_and_Fences_32x32", frame: 0 }]], body[:tiles]
        assert_equal 1, body[:entities].length
        assert_equal "prop", body[:entities].first[:kind]
      end

      test "show does not expose the editable source document on the play endpoint" do
        make_map

        get "/api/v1/maps/atrium", headers: auth(@user)

        assert_response :success
        assert_not_includes json.keys, :source
      end

      test "show returns 404 for an unknown slug" do
        get "/api/v1/maps/does-not-exist", headers: auth(@user)

        assert_response :not_found
        assert json[:error].present?
      end

      # A create payload mirroring what the editor POSTs (#105): identity, size,
      # the editable `source` and its baked artifact. The baked shape is opaque
      # jsonb the server persists verbatim, so nested arrays must survive strong
      # params intact.
      def create_params(slug: "atrium", title: "The Atrium", cols: 1, rows: 1)
        {
          slug: slug,
          title: title,
          cols: cols,
          rows: rows,
          source: { "terrain" => [["grass"]] },
          baked: {
            "tilesets" => [{ "name" => "1_Terrains_and_Fences_32x32", "cell" => 32 }],
            "tiles" => [[{ "tileset" => "1_Terrains_and_Fences_32x32", "frame" => 0 }]],
            "entities" => []
          }
        }
      end

      test "an admin creates a map and gets it back serialized (201)" do
        assert_difference "Map.count", 1 do
          post "/api/v1/maps", params: create_params, headers: auth(@user, roles: ["admin"]), as: :json
        end

        assert_response :created
        body = json
        assert_equal "atrium", body[:slug]
        assert_equal "The Atrium", body[:title]
        # The opaque baked jsonb survived strong params and round-trips through
        # the serializer — nested arrays and all.
        assert_equal [[{ tileset: "1_Terrains_and_Fences_32x32", frame: 0 }]], body[:tiles]
      end

      test "the created map is immediately readable at its slug" do
        post "/api/v1/maps", params: create_params, headers: auth(@user, roles: ["admin"]), as: :json
        assert_response :created

        get "/api/v1/maps/atrium", headers: auth(@user)
        assert_response :success
        assert_equal "atrium", json[:slug]
      end

      test "a non-admin is forbidden from creating a map" do
        assert_no_difference "Map.count" do
          post "/api/v1/maps", params: create_params, headers: auth(@user), as: :json
        end
        assert_response :forbidden
      end

      test "a duplicate slug is rejected with 422" do
        make_map(slug: "atrium")

        assert_no_difference "Map.count" do
          post "/api/v1/maps", params: create_params(slug: "atrium"), headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "non-positive dimensions are rejected with 422" do
        assert_no_difference "Map.count" do
          post "/api/v1/maps", params: create_params(cols: 0, rows: -1), headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "a blank title is rejected with 422" do
        assert_no_difference "Map.count" do
          post "/api/v1/maps", params: create_params(title: ""), headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
      end

      test "a malformed slug is rejected with 422" do
        assert_no_difference "Map.count" do
          post "/api/v1/maps", params: create_params(slug: "Not A Slug"), headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
      end
    end
  end
end
