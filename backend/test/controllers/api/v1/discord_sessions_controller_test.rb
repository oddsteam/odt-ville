require "test_helper"

module Api
  module V1
    # POST /api/v1/discord/session (#568): OAuth code in, our session out, the
    # player find-or-created by discord_id. Discord itself is a stub client.
    class DiscordSessionsControllerTest < ActionDispatch::IntegrationTest
      FakeClient = Struct.new(:me) do
        def identify(code)
          raise ::Discord::Client::Error, "bad code" unless code == "good"

          me
        end
      end

      setup do
        @company, = setup_company
        @me = { "id" => "4242", "username" => "pim", "global_name" => "Pim", "access_token" => "at-1" }
        @previous = Discord::SessionsController.discord_client
        Discord::SessionsController.discord_client = -> { FakeClient.new(@me) }
      end

      teardown { Discord::SessionsController.discord_client = @previous }

      test "first launch creates the user and returns our session" do
        assert_difference -> { ::Auth::User.count }, 1 do
          post "/api/v1/discord/session", params: { code: "good" }, as: :json
        end
        assert_response :success

        user = ::Auth::User.find_by!(discord_id: "4242")
        assert_equal "discord:4242", user.external_id
        assert_equal "Pim", user.name
        assert_equal ::Org::Company.first, user.company
        assert_equal "Pim", json[:user][:name]
        assert_equal "at-1", json[:access_token]
        assert_equal "discord:4242", ::Discord::SessionToken.claims(json[:token]).subject
      end

      test "a second launch reuses the same row" do
        2.times { post "/api/v1/discord/session", params: { code: "good" }, as: :json }

        assert_equal 1, ::Auth::User.where(discord_id: "4242").count
      end

      test "falls back to the username when there's no display name" do
        @me = @me.merge("global_name" => nil)
        post "/api/v1/discord/session", params: { code: "good" }, as: :json

        assert_equal "pim", json[:user][:name]
      end

      test "a code Discord rejects is a 401 and creates nobody" do
        assert_no_difference -> { ::Auth::User.count } do
          post "/api/v1/discord/session", params: { code: "nope" }, as: :json
        end
        assert_response :unauthorized
      end
    end
  end
end
