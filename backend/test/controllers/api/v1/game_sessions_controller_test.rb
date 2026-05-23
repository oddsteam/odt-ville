require "test_helper"

module Api
  module V1
    class GameSessionsControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
      end

      test "show for a first-time user spawns at the entrance with nil community" do
        get "/api/v1/game/session", headers: auth(@user)

        assert_response :success
        body = json
        assert_equal "town", body[:last_area]
        assert_nil body[:last_community_id]
        assert_equal({ area: "town", last_community_id: nil }, body[:spawn])
      end

      test "show for a returning user references their last visited community" do
        community = make_community(company: @company, title: "Hubble")
        @user.location_state.update!(last_area: "town", last_house_id: community.id)

        get "/api/v1/game/session", headers: auth(@user)

        body = json
        assert_equal community.id, body[:last_community_id]
        assert_equal({ area: "town", last_community_id: community.id }, body[:spawn])
      end

      test "show falls back to the entrance when the last community was deleted" do
        community = make_community(company: @company, title: "Doomed")
        @user.location_state.update!(last_area: "town", last_house_id: community.id)
        community.destroy!

        get "/api/v1/game/session", headers: auth(@user)

        body = json
        assert_nil body[:last_community_id]
        assert_equal({ area: "town", last_community_id: nil }, body[:spawn])
      end

      test "show falls back to the entrance when the last community was deactivated" do
        community = make_community(company: @company, title: "Quiet")
        @user.location_state.update!(last_area: "town", last_house_id: community.id)
        community.update!(active: false)

        get "/api/v1/game/session", headers: auth(@user)

        assert_nil json[:last_community_id]
      end

      test "update persists last_area and last_community_id" do
        community = make_community(company: @company, title: "Pinned")

        put "/api/v1/game/session",
            params: { last_area: "house", last_community_id: community.id, last_room: "must_know" },
            as: :json, headers: auth(@user)

        assert_response :success
        body = json
        assert_equal "house", body[:last_area]
        assert_equal community.id, body[:last_community_id]
        assert_equal "must_know", body[:last_room]

        @user.location_state.reload
        assert_equal "house", @user.location_state.last_area
        assert_equal community.id, @user.location_state.last_house_id
      end

      test "update drops last_community_id when it does not resolve in this company" do
        other_company, _ = setup_company(name: "Other Co")
        foreign = make_community(company: other_company, title: "Theirs")

        put "/api/v1/game/session",
            params: { last_area: "town", last_community_id: foreign.id },
            as: :json, headers: auth(@user)

        assert_response :success
        assert_nil json[:last_community_id]
      end

      test "update ignores an invalid last_area and keeps the previous one" do
        @user.location_state.update!(last_area: "town")

        put "/api/v1/game/session",
            params: { last_area: "underground" },
            as: :json, headers: auth(@user)

        assert_response :success
        assert_equal "town", json[:last_area]
      end
    end
  end
end
