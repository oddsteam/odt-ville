require "test_helper"

module Api
  module V1
    # POST /api/v1/discord/move (#571, plan decisions 3 + 5): walking into a
    # meeting zone moves the SIGNED-IN player to the voice channel whose name
    # contains the zone's name. Discord itself is a recording fake.
    class DiscordMovesControllerTest < ActionDispatch::IntegrationTest
      class FakeClient
        attr_reader :moves

        def initialize(channels)
          @channels = channels
          @moves = []
        end

        def voice_channel(_guild_id, name)
          @channels.find { |c| c["name"].downcase.include?(name.downcase) }
        end

        def move(guild_id, user_id, channel_id) = @moves << [ guild_id, user_id, channel_id ]
      end

      setup do
        @company, = setup_company
        @me = @company.users.create!(name: "Pim", role: "branch_employee", external_id: "discord:42", discord_id: "42")
        @other = @company.users.create!(name: "Ann", role: "branch_employee", external_id: "discord:77", discord_id: "77")
        map = ::Maps::Map.create!(slug: "office-ktb", title: "Office", multiplayer: true,
                                  access_policy: { "kind" => "public" }, cols: 8, rows: 8, baked: {})
        ::Discord::Guild.create!(guild_id: "111", map: map)
        fake = @fake = FakeClient.new([ { "id" => "v1", "name" => "🗣 Meeting Room" } ])
        @previous = Discord::MovesController.discord_client
        Discord::MovesController.discord_client = -> { fake }
      end

      teardown { Discord::MovesController.discord_client = @previous }

      def move!(user: @me, **params)
        post "/api/v1/discord/move", params:, headers: auth(user), as: :json
      end

      test "moves the session user to the channel matching the room name" do
        move!(guild_id: "111", room: "Meeting Room")

        assert_response :no_content
        assert_equal [ [ "111", "42", "v1" ] ], @fake.moves
      end

      test "a request naming another user still moves only the session user" do
        move!(guild_id: "111", room: "Meeting Room", user_id: "77", discord_id: "77")

        assert_response :no_content
        assert_equal [ [ "111", "42", "v1" ] ], @fake.moves
      end

      test "an unregistered guild is rejected without touching Discord" do
        move!(guild_id: "999", room: "Meeting Room")

        assert_response :not_found
        assert_equal "unknown_guild", json[:error]
        assert_empty @fake.moves
      end

      test "a room with no matching voice channel is a 404 no_voice_channel, no move" do
        move!(guild_id: "111", room: "Library")

        assert_response :not_found
        assert_equal "no_voice_channel", json[:error]
        assert_empty @fake.moves
      end

      test "a player without a Discord identity can't be moved" do
        _, web_user = setup_company(name: "Web")
        move!(user: web_user, guild_id: "111", room: "Meeting Room")

        assert_response :forbidden
        assert_empty @fake.moves
      end

      test "Discord refusing the move is a 502" do
        def @fake.move(*) = raise(::Discord::Client::Error, "not in voice")
        move!(guild_id: "111", room: "Meeting Room")

        assert_response :bad_gateway
        assert_equal "move_failed", json[:error]
      end

      test "needs a signed-in player" do
        post "/api/v1/discord/move", params: { guild_id: "111", room: "Meeting Room" }, as: :json

        assert_response :unauthorized
      end
    end
  end
end
