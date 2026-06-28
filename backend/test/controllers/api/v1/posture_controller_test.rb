require "test_helper"

module Api
  module V1
    class PostureControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
        @house = make_community(company: @company, title: "Gated")
        @house.update!(entry_gate: "posture-login", posture_set_id: "set-9")
      end

      # A fake posture-login Client: records what it was asked to start and
      # replays a canned result, so the controller is tested without the
      # service. Swapped in for PostureLogin::Client.from_env via stub.
      class FakeClient
        attr_reader :started
        def initialize(result: nil, sets: [])
          @result = result
          @sets = sets
        end

        def list_posture_sets = @sets

        def start_verification(posture_set_id:, callback_url:)
          @started = { posture_set_id:, callback_url: }
          { session_id: "sess-1", hosted_url: "https://posture.example/v/sess-1" }
        end

        def read_result(session_id:)
          @read = session_id
          @result
        end
      end

      # Swap the controller's client for our fake by overriding the from_env
      # factory for the block, then restoring the real one.
      def with_client(client)
        original = PostureLogin::Client.method(:from_env)
        PostureLogin::Client.define_singleton_method(:from_env) { |*| client }
        yield
      ensure
        PostureLogin::Client.define_singleton_method(:from_env, original)
      end

      test "sets proxies the posture-login catalog of id+name pairs" do
        client = FakeClient.new(sets: [ { id: "set-9", name: "Wave" }, { id: "set-3", name: "Peace" } ])
        with_client(client) do
          get "/api/v1/game/posture/sets", headers: auth(@user)
        end

        assert_response :success
        assert_equal [ { id: "set-9", name: "Wave" }, { id: "set-3", name: "Peace" } ],
                     json[:posture_sets].map { |s| { id: s[:id], name: s[:name] } }
      end

      test "start looks up the house's posture set and returns the hosted session" do
        client = FakeClient.new
        with_client(client) do
          post "/api/v1/game/posture/start",
               params: { community_id: @house.id, callback_url: "https://game.example/posture/callback" },
               as: :json, headers: auth(@user)
        end

        assert_response :created
        assert_equal "sess-1", json[:session_id]
        assert_equal "https://posture.example/v/sess-1", json[:hosted_url]
        assert_equal "set-9", client.started[:posture_set_id]
        assert_equal "https://game.example/posture/callback", client.started[:callback_url]
      end

      test "start 404s for a house outside the user's company" do
        other_company, _ = setup_company(name: "Other")
        foreign = make_community(company: other_company, title: "Theirs")
        foreign.update!(entry_gate: "posture-login", posture_set_id: "x")

        with_client(FakeClient.new) do
          post "/api/v1/game/posture/start",
               params: { community_id: foreign.id, callback_url: "https://game.example/cb" },
               as: :json, headers: auth(@user)
        end

        assert_response :not_found
      end

      test "start 422s when the house is not posture-gated" do
        open_house = make_community(company: @company, title: "Open")

        with_client(FakeClient.new) do
          post "/api/v1/game/posture/start",
               params: { community_id: open_house.id, callback_url: "https://game.example/cb" },
               as: :json, headers: auth(@user)
        end

        assert_response :unprocessable_entity
      end

      test "start 422s when callback_url is not an absolute http(s) url" do
        with_client(FakeClient.new) do
          post "/api/v1/game/posture/start",
               params: { community_id: @house.id, callback_url: "/relative/path" },
               as: :json, headers: auth(@user)
        end

        assert_response :unprocessable_entity
      end

      test "confirm opens the gate on a server-confirmed pass" do
        client = FakeClient.new(result: { http_status: 200, status: "passed" })
        with_client(client) do
          post "/api/v1/game/posture/confirm",
               params: { session_id: "sess-1" }, as: :json, headers: auth(@user)
        end

        assert_response :success
        assert_equal true, json[:granted]
        assert_equal "passed", json[:status]
      end

      test "confirm keeps the gate shut on a non-passing result" do
        client = FakeClient.new(result: { http_status: 404, status: nil })
        with_client(client) do
          post "/api/v1/game/posture/confirm",
               params: { session_id: "sess-1" }, as: :json, headers: auth(@user)
        end

        assert_response :success
        assert_equal false, json[:granted]
      end
    end
  end
end
