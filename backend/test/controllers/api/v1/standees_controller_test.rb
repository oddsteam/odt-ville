require "test_helper"

module Api
  module V1
    # Standees (#369, ADR-0015): a peer-to-peer cutout read alongside a map,
    # never baked into it. These specs pin the tracer contract — deploy at the
    # caller's cell, refuse on a solo map, index only that map's rows, and cascade
    # with both the owner and the map.
    class StandeesControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
      end

      # A multiplayer map is the only place a Standee may stand (ADR-0015). Kept
      # minimal — Standees never read the baked document, so an empty one is fine.
      def make_map(slug: "plaza", multiplayer: true, policy: nil)
        ::Maps::Map.create!(
          slug: slug,
          title: slug.titleize,
          multiplayer: multiplayer,
          access_policy: policy || { "kind" => "public" },
          cols: 8,
          rows: 8,
          baked: {}
        )
      end

      def deploy(slug, x: 3, y: 5, message: "Jogging Sunday 8am, anyone?", user: @user, roles: [])
        post "/api/v1/maps/#{slug}/standees",
             params: { x: x, y: y, message: message },
             headers: auth(user, roles: roles), as: :json
      end

      test "deploy succeeds on a multiplayer map at the caller's cell" do
        make_map(slug: "plaza")

        assert_difference "::Standees::Standee.count", 1 do
          deploy("plaza", x: 3, y: 5, message: "Board games in the kitchen at 4")
        end

        assert_response :created
        body = json
        assert_equal 3, body[:x]
        assert_equal 5, body[:y]
        assert_equal "Board games in the kitchen at 4", body[:message]
        # The standee belongs to the caller.
        assert_equal @user.id, ::Standees::Standee.find(body[:id]).user_id
      end

      test "deploy is refused on a non-multiplayer map" do
        make_map(slug: "hometown", multiplayer: false)

        assert_no_difference "::Standees::Standee.count" do
          deploy("hometown")
        end

        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "the deployed standee carries the owner's manifest by reference" do
        # Art is resolved `user_id -> users.character_manifest_id` at read, never
        # copied (ADR-0015): the serialized standee names the owner's manifest.
        manifest = ::Character::CharacterManifest.create!(name: "Scout", data: {})
        @user.update!(character_manifest: manifest)
        make_map(slug: "plaza")

        deploy("plaza")

        assert_response :created
        assert_equal manifest.id, json[:character_manifest_id]
      end

      test "index returns only the standees on that map" do
        plaza = make_map(slug: "plaza")
        grove = make_map(slug: "grove")
        ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 1, cell_y: 1, message: "here")
        ::Standees::Standee.create!(map: grove, user: @user, cell_x: 2, cell_y: 2, message: "there")

        get "/api/v1/maps/plaza/standees", headers: auth(@user)

        assert_response :success
        assert_equal ["here"], json.map { |s| s[:message] }
      end

      test "index is empty for a map with no standees" do
        make_map(slug: "plaza")

        get "/api/v1/maps/plaza/standees", headers: auth(@user)

        assert_response :success
        assert_equal [], json
      end

      test "a standee is deleted when its owner is deleted (cascade)" do
        plaza = make_map(slug: "plaza")
        ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 1, cell_y: 1, message: "mine")

        assert_difference "::Standees::Standee.count", -1 do
          @user.destroy
        end
      end

      test "a standee is deleted when its map is deleted (cascade)" do
        plaza = make_map(slug: "plaza")
        ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 1, cell_y: 1, message: "mine")

        assert_difference "::Standees::Standee.count", -1 do
          plaza.destroy
        end
      end

      test "deploy and index inherit the map's access gate" do
        make_map(slug: "staff-room", policy: { "kind" => "claim", "role" => "staff" })

        get "/api/v1/maps/staff-room/standees", headers: auth(@user)
        assert_response :forbidden

        deploy("staff-room")
        assert_response :forbidden

        # The same caller, now carrying the claim, is let through.
        get "/api/v1/maps/staff-room/standees", headers: auth(@user, roles: ["staff"])
        assert_response :success
      end

      test "deploy on an unknown map slug returns 404" do
        deploy("does-not-exist")
        assert_response :not_found
      end
    end
  end
end
