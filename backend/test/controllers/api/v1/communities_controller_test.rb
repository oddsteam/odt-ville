require "test_helper"

module Api
  module V1
    class CommunitiesControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
      end

      test "index lists this company's active communities with badges and board summaries" do
        a = make_community(company: @company, title: "Alpha")
        b = make_community(company: @company, title: "Beta")
        make_community(company: @company, title: "Hidden", with_welcome: false).update!(active: false)

        # An unread urgent must-know item lights up the urgent badge.
        make_item(board: a.boards.find_by(board_type: "must_know"),
                  title: "Read me", priority: "urgent")
        # And a requires_ack item that the user has not yet acknowledged.
        make_item(board: a.boards.find_by(board_type: "must_know"),
                  title: "Sign me", requires_ack: true)

        get "/api/v1/communities", headers: auth(@user)

        assert_response :success
        body = json
        titles = body[:communities].map { _1[:title] }
        assert_equal %w[Alpha Beta], titles, "inactive community must not appear"
        alpha = body[:communities].find { _1[:title] == "Alpha" }
        assert_equal({ unread: 2, urgent: 1, requires_ack: 1 }, alpha[:badges])
        board_types = alpha[:boards].map { _1[:board_type] }
        assert_equal %w[must_know should_know nice_to_know], board_types
        mk = alpha[:boards].find { _1[:board_type] == "must_know" }
        assert_equal 2, mk[:item_count]
        assert_equal 2, mk[:unread_count]
      end

      test "index exposes each community's entry gate (null when ungated)" do
        gated = make_community(company: @company, title: "Gated")
        gated.update!(entry_gate: "posture-login", posture_set_id: "set-123")
        make_community(company: @company, title: "Open")

        get "/api/v1/communities", headers: auth(@user)

        assert_response :success
        by_title = json[:communities].index_by { _1[:title] }
        assert_equal "posture-login", by_title["Gated"][:entry_gate]
        assert_nil by_title["Open"][:entry_gate]
        # posture_set_id is server-only — never shipped to the browser.
        assert_not by_title["Gated"].key?(:posture_set_id)
      end

      test "index excludes other companies' communities" do
        make_community(company: @company, title: "Mine")
        other_company, _ = setup_company(name: "Other Co")
        make_community(company: other_company, title: "Theirs")

        get "/api/v1/communities", headers: auth(@user)

        assert_response :success
        assert_equal ["Mine"], json[:communities].map { _1[:title] }
      end

      test "show returns the community wrapper plus its three boards with items" do
        community = make_community(company: @company, title: "Detail")
        make_item(board: community.boards.find_by(board_type: "must_know"), title: "MK item")
        make_item(board: community.boards.find_by(board_type: "should_know"), title: "SK item")

        get "/api/v1/communities/#{community.id}", headers: auth(@user)

        assert_response :success
        body = json
        assert_equal community.id, body[:community][:id]
        assert_equal "Detail", body[:community][:title]
        board_types = body[:boards].map { _1[:board_type] }
        assert_equal %w[must_know should_know nice_to_know], board_types
        mk = body[:boards].find { _1[:board_type] == "must_know" }
        assert_equal ["MK item"], mk[:content_items].map { _1[:title] }
      end

      test "show 404s when the community belongs to another company" do
        other_company, _ = setup_company(name: "Other Co")
        foreign = make_community(company: other_company, title: "Foreign")

        get "/api/v1/communities/#{foreign.id}", headers: auth(@user)

        assert_response :not_found
      end

      test "a non-admin is forbidden from creating a community" do
        assert_no_difference "::Communities::House.count" do
          post "/api/v1/communities", params: { title: "Nope" }, headers: auth(@user)
        end
        assert_response :forbidden
      end

      test "create makes a community with three boards plus a welcome must-know item" do
        post "/api/v1/communities",
             params: { title: "New Hub", color: "#abcdef", category_key: "learning" },
             as: :json, headers: auth(@user, roles: ["admin"])

        assert_response :created
        body = json
        assert_kind_of Integer, body[:id]
        assert_equal "New Hub", body[:title]

        community = ::Communities::House.find(body[:id])
        assert_equal @company.id, community.company_id
        assert_equal %w[must_know nice_to_know should_know],
                     community.boards.pluck(:board_type).sort
        mk_items = community.boards.find_by(board_type: "must_know").content_items
        assert_equal 1, mk_items.count
        assert_match(/Welcome to New Hub/, mk_items.first.title)
      end

      test "create supplies defaults when fields are blank" do
        post "/api/v1/communities", params: {}, as: :json, headers: auth(@user, roles: ["admin"])

        assert_response :created
        community = ::Communities::House.find(json[:id])
        assert_equal "New Community", community.title
        assert_equal "community", community.category_key
        assert_equal "#888888", community.color
      end

      test "update sets a posture-login gate with its posture set" do
        community = make_community(company: @company, title: "Gatable")

        patch "/api/v1/communities/#{community.id}",
              params: { entry_gate: "posture-login", posture_set_id: "set-9" },
              as: :json, headers: auth(@user, roles: ["admin"])

        assert_response :success
        community.reload
        assert_equal "posture-login", community.entry_gate
        assert_equal "set-9", community.posture_set_id
      end

      test "update with no gate clears both the gate and the posture set" do
        community = make_community(company: @company, title: "WasGated")
        community.update!(entry_gate: "posture-login", posture_set_id: "set-9")

        patch "/api/v1/communities/#{community.id}",
              params: { entry_gate: nil, posture_set_id: nil },
              as: :json, headers: auth(@user, roles: ["admin"])

        assert_response :success
        community.reload
        assert_nil community.entry_gate
        assert_nil community.posture_set_id
      end

      test "update 422s when a posture-login gate has no posture set" do
        community = make_community(company: @company, title: "Halfset")

        patch "/api/v1/communities/#{community.id}",
              params: { entry_gate: "posture-login", posture_set_id: "" },
              as: :json, headers: auth(@user, roles: ["admin"])

        assert_response :unprocessable_entity
        assert_nil community.reload.entry_gate
      end

      test "update 404s across companies" do
        other_company, _ = setup_company(name: "Other Co")
        foreign = make_community(company: other_company, title: "Theirs")

        patch "/api/v1/communities/#{foreign.id}",
              params: { entry_gate: "posture-login", posture_set_id: "x" },
              as: :json, headers: auth(@user, roles: ["admin"])

        assert_response :not_found
      end

      test "destroy removes the community plus its boards and content cascade" do
        community = make_community(company: @company, title: "Gone")
        item = make_item(board: community.boards.find_by(board_type: "must_know"))

        assert_difference -> { ::Communities::House.count } => -1,
                          -> { ::Communities::Board.count } => -3,
                          -> { ::Communities::ContentItem.count } => -1 do
          delete "/api/v1/communities/#{community.id}", headers: auth(@user, roles: ["admin"])
        end

        assert_response :no_content
        assert_nil ::Communities::House.find_by(id: community.id)
        assert_nil ::Communities::ContentItem.find_by(id: item.id)
      end

      test "destroy 404s across companies" do
        other_company, _ = setup_company(name: "Other Co")
        foreign = make_community(company: other_company, title: "Theirs")

        delete "/api/v1/communities/#{foreign.id}", headers: auth(@user, roles: ["admin"])

        assert_response :not_found
        assert ::Communities::House.exists?(foreign.id)
      end
    end
  end
end
