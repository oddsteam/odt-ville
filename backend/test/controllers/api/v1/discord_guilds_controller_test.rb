require "test_helper"

module Api
  module V1
    # GET /api/v1/discord/guilds/:guild_id/map (#569): the Activity asks which
    # map its server runs; an unregistered server is a 404.
    class DiscordGuildsControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
        @map = ::Maps::Map.create!(slug: "office-ktb", title: "Office", multiplayer: true,
                                   access_policy: { "kind" => "public" }, cols: 8, rows: 8, baked: {})
        ::Discord::Guild.create!(guild_id: "111", map: @map)
      end

      test "a registered guild returns its map slug" do
        get "/api/v1/discord/guilds/111/map", headers: auth(@user)

        assert_response :success
        assert_equal "office-ktb", json[:slug]
      end

      test "an unknown guild is a 404" do
        get "/api/v1/discord/guilds/999/map", headers: auth(@user)

        assert_response :not_found
      end

      test "needs a signed-in player" do
        get "/api/v1/discord/guilds/111/map"

        assert_response :unauthorized
      end
    end
  end
end
