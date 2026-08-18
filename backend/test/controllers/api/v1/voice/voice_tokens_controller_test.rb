require "test_helper"

module Api
  module V1
    module Voice
      class VoiceTokensControllerTest < ActionDispatch::IntegrationTest
        SECRET = "test-secret"

        setup do
          @company, @user = setup_company(name: "ODT", user_name: "Alice")
          ENV["LIVEKIT_API_KEY"] = "test-key"
          ENV["LIVEKIT_API_SECRET"] = SECRET
        end

        teardown do
          ENV.delete("LIVEKIT_API_KEY")
          ENV.delete("LIVEKIT_API_SECRET")
        end

        def claims(jwt)
          JWT.decode(jwt, SECRET, true, algorithm: "HS256").first
        end

        test "an authenticated user gets a token scoped to the map's room" do
          get "/api/v1/voice/token", params: { map: "town" }, headers: auth(@user)

          assert_response :success
          c = claims(json[:token])
          assert_equal @user.external_id, c["sub"]
          assert_equal "town", json[:room].sub(/\Amap-/, "")
          assert_equal json[:room], c["video"]["room"]
          assert_equal true, c["video"]["roomJoin"]
        end

        test "the response never leaks the api secret" do
          get "/api/v1/voice/token", params: { map: "town" }, headers: auth(@user)

          assert_not_includes response.body, SECRET
        end

        test "an unauthenticated request is rejected with 401" do
          get "/api/v1/voice/token", params: { map: "town" }

          assert_response :unauthorized
        end

        # A meeting room (#486): the roomId must name a meeting zone authored on a
        # map the caller can reach, so the browser can't mint a token for any room.
        def map_with_meeting(slug: "hq", room_id: "standup", access_policy: { "kind" => "public" })
          ::Maps::Map.create!(
            slug: slug, title: slug.titleize, cols: 8, rows: 6,
            access_policy: access_policy,
            baked: { "zones" => [
              { "trigger" => "on_enter", "x" => 5, "y" => 5, "w" => 3, "h" => 3,
                "payload" => { "kind" => "meeting", "roomId" => room_id } }
            ] }
          )
        end

        test "mints a token scoped to a meeting room authored on a reachable map" do
          map_with_meeting(slug: "hq", room_id: "standup")

          get "/api/v1/voice/token", params: { map: "hq", meeting: "standup" }, headers: auth(@user)

          assert_response :success
          assert_equal "meeting-standup", json[:room]
          c = claims(json[:token])
          assert_equal "meeting-standup", c["video"]["room"]
          assert_equal true, c["video"]["roomJoin"]
        end

        test "rejects a meeting roomId that no zone on the map authors" do
          map_with_meeting(slug: "hq", room_id: "standup")

          get "/api/v1/voice/token", params: { map: "hq", meeting: "ghost" }, headers: auth(@user)

          assert_response :forbidden
        end

        test "rejects a meeting room on a map the caller cannot reach" do
          map_with_meeting(slug: "hq", room_id: "standup",
                           access_policy: { "kind" => "claim", "role" => "insider" })

          get "/api/v1/voice/token", params: { map: "hq", meeting: "standup" }, headers: auth(@user)

          assert_response :forbidden
        end

        test "a meeting request for an unknown map is 404" do
          get "/api/v1/voice/token", params: { map: "nowhere", meeting: "standup" }, headers: auth(@user)

          assert_response :not_found
        end
      end
    end
  end
end
