require "test_helper"

module Api
  module V1
    # GET /api/v1/org/basecamp_people (#392): the roster the operator picks from
    # when email couldn't join someone to their face. Fetched server-side through
    # Basecamp::Client; the signed avatar URL never reaches the browser (ADR-0012)
    # — each candidate's face rides back as inlined bytes, gated behind admin.
    class BasecampPeopleControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company

        @roster = [
          { "id" => 1, "name" => "Ada Lovelace", "avatar_url" => "https://bc.test/ada.png" },
          { "id" => 2, "name" => "Alan Turing", "avatar_url" => "https://bc.test/alan.png" },
          { "id" => 3, "name" => "Grace Hopper", "avatar_url" => "https://bc.test/grace.png" }
        ]
        # A whole roster in one page — paging is the client's job (#326), stubbed
        # away here, and the avatar bytes come from a stubbed fetch seam.
        Org::BasecampPeopleController.client_factory = -> { FakeClient.new(@roster) }
        Org::BasecampPeopleController.fetcher = ->(_url) { [ "PNGBYTES", "image/png" ] }
      end

      teardown do
        Org::BasecampPeopleController.reset_seams!
      end

      FakeClient = Struct.new(:roster) do
        def get(_path) = roster
      end

      test "returns 403 without the admin realm role" do
        get "/api/v1/org/basecamp_people", params: { q: "ada" }, headers: auth(@user)

        assert_response :forbidden
      end

      test "an admin searches people by name, case-insensitively" do
        get "/api/v1/org/basecamp_people", params: { q: "LA" }, headers: auth(@user, roles: %w[admin])

        assert_response :success
        assert_equal [ "Ada Lovelace", "Alan Turing" ], json.map { _1[:name] }.sort
        assert_equal [ 1, 2 ], json.map { _1[:id] }.sort
      end

      test "each candidate's avatar comes back as inlined bytes, never the signed URL" do
        get "/api/v1/org/basecamp_people", params: { q: "grace" }, headers: auth(@user, roles: %w[admin])

        candidate = json.sole
        assert_equal "data:image/png;base64,#{Base64.strict_encode64('PNGBYTES')}", candidate[:avatar]
        refute_includes response.body, "bc.test", "the signed Basecamp URL must not reach the browser"
      end

      test "a blank or too-short query returns nothing rather than the whole roster" do
        get "/api/v1/org/basecamp_people", params: { q: "a" }, headers: auth(@user, roles: %w[admin])

        assert_response :success
        assert_equal [], json
      end
    end
  end
end
