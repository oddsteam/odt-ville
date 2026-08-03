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

      def deploy(slug, x: 3, y: 5, message: "Jogging Sunday 8am, anyone?", detail: nil, reply_link: nil, user: @user, roles: [])
        post "/api/v1/maps/#{slug}/standees",
             params: { x: x, y: y, message: message, detail: detail, reply_link: reply_link },
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

      test "the serialized standee carries the Placard's detail body and owner attribution" do
        # The full Placard (#372): who left it, their face, and the detail body.
        @user.update!(name: "Ada Lovelace", avatar_url: "roster/ada.png")
        make_map(slug: "plaza")

        deploy("plaza", message: "Jogging Sunday?", detail: "Meet at the gym door, 8am, bring water")

        assert_response :created
        body = json
        assert_equal "Meet at the gym door, 8am, bring water", body[:detail]
        assert_equal "Ada Lovelace", body[:owner_name]
        # The face rides the avatar proxy path, never the stored Basecamp URL.
        assert_equal "/api/v1/users/#{@user.external_id}/avatar", body[:owner_avatar_url]
      end

      test "a Placard with no detail and no avatar serializes them as null" do
        make_map(slug: "plaza")

        deploy("plaza")

        assert_response :created
        assert_nil json[:detail]
        assert_nil json[:owner_avatar_url]
      end

      test "the deployed standee carries the owner-supplied reply link" do
        # The reply link (#373): the campfire or thread where the conversation
        # happens, stored raw and echoed back. The client gates the click-through.
        make_map(slug: "plaza")

        deploy("plaza", reply_link: "https://basecamp.com/1/campfire/2")

        assert_response :created
        assert_equal "https://basecamp.com/1/campfire/2", json[:reply_link]
      end

      test "a Placard with no reply link serializes it as null" do
        make_map(slug: "plaza")

        deploy("plaza")

        assert_response :created
        assert_nil json[:reply_link]
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

      # --- Budget: 3 across all maps (#371, ADR-0015) ---------------------

      # Fill the caller's world-wide budget to the cap, spread across two maps so
      # the count is proven to span maps rather than being per-map.
      def fill_budget
        plaza = make_map(slug: "plaza")
        grove = make_map(slug: "grove")
        ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 3, cell_y: 5, message: "one")
        ::Standees::Standee.create!(map: grove, user: @user, cell_x: 2, cell_y: 2, message: "two")
        ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 1, cell_y: 1, message: "three")
      end

      test "deploy at the cap is refused with a located pointer and no new row" do
        fill_budget

        assert_no_difference "::Standees::Standee.count" do
          deploy("plaza", message: "one too many")
        end

        assert_response :unprocessable_entity
        # The refusal names where the existing Standees are standing.
        assert_match "Plaza (3, 5)", json[:error]
        assert_match "Grove (2, 2)", json[:error]
      end

      test "another employee's Standees do not consume my budget" do
        _, other = setup_company
        plaza = make_map(slug: "plaza")
        3.times { |i| ::Standees::Standee.create!(map: plaza, user: other, cell_x: i, cell_y: 0, message: "theirs") }

        assert_difference "::Standees::Standee.count", 1 do
          deploy("plaza")
        end
        assert_response :created
      end

      test "mine returns the caller's Standees across all maps with the cap" do
        fill_budget

        get "/api/v1/standees/mine", headers: auth(@user)

        assert_response :success
        assert_equal 3, json[:cap]
        assert_equal 3, json[:out]
        # Every map the caller has a Standee on is named, with its cell.
        titles = json[:standees].map { |s| s[:map_title] }
        assert_equal ["Plaza", "Grove", "Plaza"], titles
        assert_equal ["plaza", "grove", "plaza"], json[:standees].map { |s| s[:map_slug] }
      end

      test "mine is empty for an employee with none out" do
        get "/api/v1/standees/mine", headers: auth(@user)

        assert_response :success
        assert_equal 0, json[:out]
        assert_equal [], json[:standees]
      end
    end
  end
end
