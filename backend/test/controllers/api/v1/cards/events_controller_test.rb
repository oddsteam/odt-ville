require "test_helper"

module Api
  module V1
    module Cards
      # Card ingest (#317): the service-to-service webhook Eira pushes a
      # person's current card to. No user session, no Jira token, no Jira call —
      # Eira pre-resolves the card and we only ever see { title, status, url }.
      class EventsControllerTest < ActionDispatch::IntegrationTest
        include ActionCable::TestHelper

        TOKEN = "shared-service-token"
        CARD = { "title" => "Wire up the pathfinder", "status" => "DOING",
                 "url" => "https://jira/browse/ONEREV-1" }.freeze

        setup do
          @company, @user = setup_company(name: "ODT", user_name: "Alice")
          @user.update!(email: "alice@odds.team")
          ENV["ODT_VILLE_INGEST_TOKEN"] = TOKEN
        end

        teardown do
          ENV.delete("ODT_VILLE_INGEST_TOKEN")
          ::Cards::Registry.clear
        end

        def post_event(email:, card:, token: TOKEN)
          headers = token ? { "Authorization" => "Bearer #{token}" } : {}
          post "/api/v1/cards/event", params: { email: email, card: card }, headers: headers, as: :json
        end

        test "a posted card is held against the named person" do
          post_event(email: "alice@odds.team", card: CARD)

          assert_response :no_content
          assert_equal CARD, ::Cards::Registry.for(@user.external_id)
        end

        test "the email join is case-insensitive" do
          post_event(email: "Alice@ODDS.team", card: CARD)

          assert_equal CARD, ::Cards::Registry.for(@user.external_id)
        end

        test "a null card puts the card down" do
          post_event(email: "alice@odds.team", card: CARD)

          post_event(email: "alice@odds.team", card: nil)

          assert_response :no_content
          assert_nil ::Cards::Registry.for(@user.external_id)
        end

        # Exactly one active card per person — this is not a move feed.
        test "a second card replaces the first" do
          post_event(email: "alice@odds.team", card: CARD)

          post_event(email: "alice@odds.team", card: CARD.merge("title" => "Bake the map"))

          assert_equal "Bake the map", ::Cards::Registry.for(@user.external_id)["title"]
        end

        # Eira retries any non-2xx, so a processed-but-unacknowledged event
        # arrives again: the same delivery twice must leave identical state.
        test "the same event twice leaves identical state" do
          post_event(email: "alice@odds.team", card: CARD)
          before = ::Cards::Registry.for(@user.external_id)

          post_event(email: "alice@odds.team", card: CARD)

          assert_equal before, ::Cards::Registry.for(@user.external_id)
        end

        # Eira pushes for everyone it tracks, not just people we know.
        test "an email we do not know is a quiet no-op" do
          post_event(email: "nobody@odds.team", card: CARD)

          assert_response :no_content
        end

        # The live half: connected clients learn about the change over the
        # presence cable they already hold open — no polling, no reload.
        test "a posted card is relayed to connected clients" do
          frame = { type: "card", userId: @user.external_id, card: CARD }

          assert_broadcast_on(GameSession::PresenceChannel::CARD_STREAM, frame) do
            post_event(email: "alice@odds.team", card: CARD)
          end
        end

        test "a null card relays the clear" do
          frame = { type: "card", userId: @user.external_id, card: nil }

          assert_broadcast_on(GameSession::PresenceChannel::CARD_STREAM, frame) do
            post_event(email: "alice@odds.team", card: nil)
          end
        end

        test "an email we do not know relays nothing" do
          assert_no_broadcasts(GameSession::PresenceChannel::CARD_STREAM) do
            post_event(email: "nobody@odds.team", card: CARD)
          end
        end

        test "an unauthenticated call is rejected" do
          post_event(email: "alice@odds.team", card: CARD, token: nil)

          assert_response :unauthorized
          assert_nil ::Cards::Registry.for(@user.external_id)
        end

        test "a mismatched token is rejected" do
          post_event(email: "alice@odds.team", card: CARD, token: "wrong")

          assert_response :unauthorized
          assert_nil ::Cards::Registry.for(@user.external_id)
        end

        # Fail closed: an unconfigured token must not mean "let everyone in".
        test "no configured token rejects every call" do
          ENV.delete("ODT_VILLE_INGEST_TOKEN")

          post_event(email: "alice@odds.team", card: CARD, token: "")

          assert_response :unauthorized
          assert_nil ::Cards::Registry.for(@user.external_id)
        end

        # A user session is not a service credential — the ingest is
        # service-to-service only, so a real player's JWT buys nothing.
        test "a user bearer token is not a service credential" do
          post_event(email: "alice@odds.team", card: CARD, token: @user.external_id)

          assert_response :unauthorized
        end
      end
    end
  end
end
