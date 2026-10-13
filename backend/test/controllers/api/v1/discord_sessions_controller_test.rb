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
        # Guild membership scopes this surface (ADR-0022), not an email domain:
        # a Discord player is Staff, never auto-classified as a Client.
        assert_equal false, user.external
      end

      test "a racing first launch re-finds the winner's row instead of 500ing" do
        company = ::Org::Company.first!
        ::Auth::User.define_singleton_method(:find_or_create_by!) do |*|
          # The other launch's insert lands between our find and our create.
          ::Auth::User.create!(discord_id: "4242", external_id: "discord:4242", name: "Pim", company: company,
                               role: "branch_employee")
          raise ActiveRecord::RecordNotUnique, "duplicate key value violates unique constraint"
        end

        post "/api/v1/discord/session", params: { code: "good" }, as: :json

        assert_response :success
        assert_equal "discord:4242", ::Discord::SessionToken.claims(json[:token]).subject
      ensure
        ::Auth::User.singleton_class.remove_method(:find_or_create_by!)
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
