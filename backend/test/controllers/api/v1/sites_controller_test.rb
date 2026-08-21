require "test_helper"

module Api
  module V1
    # GET /api/v1/org/sites (#503): the Site names behind the community scope
    # picker. Admin-gated; a bare, ordered name list (the scope is FK-less by
    # name).
    class SitesControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
      end

      test "returns 403 without the admin realm role" do
        get "/api/v1/org/sites", headers: auth(@user)

        assert_response :forbidden
      end

      test "returns the site names, ordered" do
        ::Org::Site.create!(name: "TTB", kind: "client")
        ::Org::Site.create!(name: "KTB", kind: "client")

        get "/api/v1/org/sites", headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal %w[KTB TTB], json[:sites]
      end
    end
  end
end
