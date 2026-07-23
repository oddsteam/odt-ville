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
      end
    end
  end
end
