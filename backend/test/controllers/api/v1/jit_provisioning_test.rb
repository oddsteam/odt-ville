require "test_helper"

module Api
  module V1
    # JIT provisioning (issue #96, Option 1): a verified token from an allowed
    # email domain auto-creates the local user on first login, keyed by email so
    # a later IdP swap (#97) re-links instead of duplicating. Stubbed token is
    # "<sub>||<email>" (see test_helper).
    class JitProvisioningTest < ActionDispatch::IntegrationTest
      setup do
        @company, _ = setup_company(name: "ODT") # ensures Company.first exists
      end

      def auth_email(sub, email)
        { "Authorization" => "Bearer #{sub}||#{email}" }
      end

      test "first login from an allowed domain provisions a local user" do
        assert_difference -> { User.count }, 1 do
          get "/api/v1/me", headers: auth_email("kc-sub-1", "newbie@odds.team")
        end
        assert_response :success
        u = User.find_by(external_id: "kc-sub-1")
        assert_equal "newbie@odds.team", u.email
        assert_equal "branch_employee", u.role
        assert_equal @company.id, u.company_id
        assert_equal u.id, json[:user][:id]
      end

      test "allowed domain match is case-insensitive" do
        get "/api/v1/me", headers: auth_email("kc-sub-2", "Mixed@ODT.co.th")
        assert_response :success
        assert_equal "mixed@odt.co.th", User.find_by(external_id: "kc-sub-2").email
      end

      test "a disallowed email domain is rejected and provisions nothing" do
        assert_no_difference -> { User.count } do
          get "/api/v1/me", headers: auth_email("kc-sub-3", "stranger@gmail.com")
        end
        assert_response :unauthorized
      end

      test "a returning user re-links by email when their subject changes" do
        existing = @company.users.create!(name: "Carol", role: "branch_manager",
          external_id: "old-sub", email: "carol@odds.team")
        assert_no_difference -> { User.count } do
          get "/api/v1/me", headers: auth_email("new-sub", "carol@odds.team")
        end
        assert_response :success
        existing.reload
        assert_equal "new-sub", existing.external_id
        assert_equal "branch_manager", existing.role # preserved, not reset
        assert_equal existing.id, json[:user][:id]
      end
    end
  end
end
