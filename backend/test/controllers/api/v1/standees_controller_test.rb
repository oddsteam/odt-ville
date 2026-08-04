require "test_helper"

module Api
  module V1
    # Standees (#369, ADR-0015): a peer-to-peer cutout read alongside a map,
    # never baked into it. These specs pin the tracer contract — deploy at the
    # caller's cell, refuse on a solo map, index only that map's rows, and cascade
    # with both the owner and the map.
    class StandeesControllerTest < ActionDispatch::IntegrationTest
      # Live cutouts (#375): deploy/pickup broadcast on the map's standee stream.
      include ActionCable::TestHelper

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

      def deploy(slug, x: 3, y: 5, message: "Jogging Sunday 8am, anyone?", detail: nil, reply_link: nil, expires_days: nil, user: @user, roles: [])
        post "/api/v1/maps/#{slug}/standees",
             params: { x: x, y: y, message: message, detail: detail, reply_link: reply_link,
                       expires_days: expires_days },
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

      # --- Expiry: a cutout retires itself (#374, ADR-0015) -----------------

      test "deploy defaults the expiry to seven days out" do
        make_map(slug: "plaza")

        deploy("plaza")

        assert_response :created
        assert_in_delta 7.days.from_now, ::Standees::Standee.find(json[:id]).expires_at, 60
        # The client holds the expiry, so it can retire the cutout itself.
        assert_equal ::Standees::Standee.find(json[:id]).expires_at.iso8601, json[:expires_at]
      end

      test "deploy honours an owner-chosen window inside the cap" do
        make_map(slug: "plaza")

        deploy("plaza", expires_days: 30)

        assert_response :created
        assert_in_delta 30.days.from_now, ::Standees::Standee.find(json[:id]).expires_at, 60
      end

      test "deploy refuses a window beyond the thirty-day cap" do
        make_map(slug: "plaza")

        assert_no_difference "::Standees::Standee.count" do
          deploy("plaza", expires_days: 31)
        end

        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "deploy refuses a window of nothing at all" do
        make_map(slug: "plaza")

        assert_no_difference "::Standees::Standee.count" do
          deploy("plaza", expires_days: 0)
        end

        assert_response :unprocessable_entity
      end

      test "index excludes a Standee whose expiry has passed" do
        # No sweeper and no server tick (#374): the row stays, the load query
        # simply stops returning it the moment it is past.
        plaza = make_map(slug: "plaza")
        ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 1, cell_y: 1, message: "live",
                                    expires_at: 1.hour.from_now)
        ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 2, cell_y: 2, message: "gone",
                                    expires_at: 1.second.ago)

        get "/api/v1/maps/plaza/standees", headers: auth(@user)

        assert_response :success
        assert_equal ["live"], json.map { |s| s[:message] }
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

      # --- Pickup: the owner takes their own cutout back (#370, ADR-0015) ----

      test "the owner picks up their own Standee — the row is gone and the slot freed" do
        plaza = make_map(slug: "plaza")
        standee = ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 3, cell_y: 5, message: "mine")

        assert_difference "::Standees::Standee.count", -1 do
          delete "/api/v1/standees/#{standee.id}", headers: auth(@user)
        end

        assert_response :no_content
        assert_nil ::Standees::Standee.find_by(id: standee.id)
      end

      test "a non-owner may not pick up someone else's Standee" do
        _, other = setup_company
        plaza = make_map(slug: "plaza")
        standee = ::Standees::Standee.create!(map: plaza, user: other, cell_x: 3, cell_y: 5, message: "theirs")

        assert_no_difference "::Standees::Standee.count" do
          delete "/api/v1/standees/#{standee.id}", headers: auth(@user)
        end

        assert_response :forbidden
        assert ::Standees::Standee.exists?(standee.id)
      end

      test "picking up an unknown Standee returns 404" do
        delete "/api/v1/standees/999999", headers: auth(@user)
        assert_response :not_found
      end

      test "index flags the caller's own Standees as mine" do
        # The affordance differs by who is asking (#370): press-A offers pick up
        # on your own cutout, reply on someone else's — so index tells the client
        # which is which.
        _, other = setup_company
        plaza = make_map(slug: "plaza")
        ::Standees::Standee.create!(map: plaza, user: @user, cell_x: 1, cell_y: 1, message: "mine")
        ::Standees::Standee.create!(map: plaza, user: other, cell_x: 2, cell_y: 2, message: "theirs")

        get "/api/v1/maps/plaza/standees", headers: auth(@user)

        assert_response :success
        by_message = json.to_h { |s| [s[:message], s[:mine]] }
        assert_equal true, by_message["mine"]
        assert_equal false, by_message["theirs"]
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

      test "an expired Standee consumes no budget" do
        # Expiry frees the slot on its own (#374) — the cap counts what is still
        # standing, so an owner at the cap can deploy again once one has retired.
        fill_budget
        ::Standees::Standee.order(:id).first.update!(expires_at: 1.second.ago)

        assert_difference "::Standees::Standee.count", 1 do
          deploy("plaza", message: "the freed slot")
        end
        assert_response :created

        get "/api/v1/standees/mine", headers: auth(@user)
        assert_equal 3, json[:out]
        assert_not_includes json[:standees].map { |s| s[:message] }, "one"
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

      # Live cutouts (#375): the write stays the durable REST write it always
      # was; the broadcast is a *consequence* of it, so everyone standing on the
      # map sees the cutout go up (or come down) without a reload.
      test "a successful deploy broadcasts the new Standee on the map's standee stream" do
        map = make_map(slug: "plaza")

        assert_broadcasts PresenceChannel.standee_stream(map.id), 1 do
          deploy("plaza", message: "Board games at 4")
        end

        frame = broadcasts(PresenceChannel.standee_stream(map.id)).last.then { |f| JSON.parse(f).deep_symbolize_keys }
        assert_equal "standee:deploy", frame[:type]
        # The owner's own id rides along so their own echo is suppressed client
        # side — their cutout is already standing.
        assert_equal @user.external_id, frame[:userId]
        assert_equal "Board games at 4", frame[:standee][:message]
      end

      test "a refused deploy broadcasts nothing" do
        map = make_map(slug: "hometown", multiplayer: false)

        assert_no_broadcasts PresenceChannel.standee_stream(map.id) do
          deploy("hometown")
        end
      end

      test "a pick-up broadcasts the removal on the map's standee stream" do
        map = make_map(slug: "plaza")
        standee = ::Standees::Standee.create!(map: map, user: @user, cell_x: 1, cell_y: 2, message: "mine")

        assert_broadcasts PresenceChannel.standee_stream(map.id), 1 do
          delete "/api/v1/standees/#{standee.id}", headers: auth(@user)
        end

        frame = broadcasts(PresenceChannel.standee_stream(map.id)).last.then { |f| JSON.parse(f).deep_symbolize_keys }
        assert_equal "standee:pickup", frame[:type]
        assert_equal standee.id, frame[:id]
      end

      test "a refused pick-up broadcasts nothing" do
        map = make_map(slug: "plaza")
        _, other = setup_company
        standee = ::Standees::Standee.create!(map: map, user: other, cell_x: 1, cell_y: 2, message: "theirs")

        assert_no_broadcasts PresenceChannel.standee_stream(map.id) do
          delete "/api/v1/standees/#{standee.id}", headers: auth(@user)
        end
        assert_response :forbidden
      end
    end
  end
end
