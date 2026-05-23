require "test_helper"

module Api
  module V1
    class ContentItemsControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
      end

      test "feed returns every effective must-know item plus urgent items elsewhere" do
        alpha = make_community(company: @company, title: "Alpha")
        beta = make_community(company: @company, title: "Beta")

        mk_normal = make_item(board: alpha.boards.find_by(board_type: "must_know"),
                              title: "Alpha must-know")
        sk_urgent = make_item(board: beta.boards.find_by(board_type: "should_know"),
                              title: "Beta should-know urgent", priority: "urgent")
        # A non-urgent should_know item should NOT appear in the feed.
        make_item(board: beta.boards.find_by(board_type: "should_know"),
                  title: "Beta should-know normal")

        get "/api/v1/content_items/feed", headers: auth(@user)

        assert_response :success
        titles = json[:items].map { _1[:title] }
        assert_includes titles, mk_normal.title
        assert_includes titles, sk_urgent.title
        refute_includes titles, "Beta should-know normal"
      end

      test "feed sorts urgent first, then by community id and item recency" do
        alpha = make_community(company: @company, title: "Alpha")
        beta = make_community(company: @company, title: "Beta")

        normal = make_item(board: alpha.boards.find_by(board_type: "must_know"),
                           title: "Normal", priority: "normal")
        urgent = make_item(board: beta.boards.find_by(board_type: "must_know"),
                           title: "Urgent", priority: "urgent")
        important = make_item(board: alpha.boards.find_by(board_type: "must_know"),
                              title: "Important", priority: "important")

        get "/api/v1/content_items/feed", headers: auth(@user)

        titles = json[:items].map { _1[:title] }
        assert_equal urgent.title, titles.first, "urgent items must lead"
        assert_operator titles.index(important.title), :<, titles.index(normal.title),
                        "important comes before normal"
      end

      test "feed shows community id, title and board type per item" do
        alpha = make_community(company: @company, title: "Alpha")
        make_item(board: alpha.boards.find_by(board_type: "must_know"), title: "MK")

        get "/api/v1/content_items/feed", headers: auth(@user)

        row = json[:items].first
        assert_equal alpha.id, row[:community_id]
        assert_equal "Alpha", row[:community_title]
        assert_equal "must_know", row[:board_type]
      end

      test "feed only includes effective items" do
        alpha = make_community(company: @company, title: "Alpha")
        # An item whose effective_from is in the future is not yet live.
        make_item(board: alpha.boards.find_by(board_type: "must_know"),
                  title: "Future", effective_from: 1.day.from_now)
        # An item whose expires_at has passed is no longer live.
        make_item(board: alpha.boards.find_by(board_type: "must_know"),
                  title: "Past", effective_from: 2.days.ago, expires_at: 1.day.ago)
        live = make_item(board: alpha.boards.find_by(board_type: "must_know"),
                         title: "Live")

        get "/api/v1/content_items/feed", headers: auth(@user)

        titles = json[:items].map { _1[:title] }
        assert_equal [live.title], titles
      end

      test "open marks an unread item as opened" do
        alpha = make_community(company: @company)
        item = make_item(board: alpha.boards.find_by(board_type: "must_know"))

        post "/api/v1/content_items/#{item.id}/open", headers: auth(@user)

        assert_response :success
        body = json
        assert_equal item.id, body[:id]
        assert_equal "opened", body[:state]
        assert_not_nil body[:opened_at]
        assert_equal "opened", @user.user_content_states.find_by(content_item: item).state
      end

      test "open is idempotent — already-opened items keep their opened_at" do
        alpha = make_community(company: @company)
        item = make_item(board: alpha.boards.find_by(board_type: "must_know"))

        post "/api/v1/content_items/#{item.id}/open", headers: auth(@user)
        first_opened_at = json[:opened_at]
        travel 1.minute do
          post "/api/v1/content_items/#{item.id}/open", headers: auth(@user)
        end

        assert_equal first_opened_at, json[:opened_at]
      end

      test "acknowledge marks the item acknowledged and stamps both timestamps" do
        alpha = make_community(company: @company)
        item = make_item(board: alpha.boards.find_by(board_type: "must_know"))

        post "/api/v1/content_items/#{item.id}/acknowledge", headers: auth(@user)

        assert_response :success
        body = json
        assert_equal "acknowledged", body[:state]
        assert_not_nil body[:opened_at]
        assert_not_nil body[:acknowledged_at]
      end

      test "open 404s when the item belongs to another company" do
        other_company, _ = setup_company(name: "Other Co")
        foreign_community = make_community(company: other_company)
        foreign_item = make_item(board: foreign_community.boards.find_by(board_type: "must_know"))

        post "/api/v1/content_items/#{foreign_item.id}/open", headers: auth(@user)

        assert_response :not_found
      end
    end
  end
end
