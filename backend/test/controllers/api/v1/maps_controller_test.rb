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
    end
  end
end
