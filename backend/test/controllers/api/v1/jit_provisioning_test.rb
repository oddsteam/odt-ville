require "test_helper"

module Api
  module V1
    # JIT provisioning (issue #96, Option 1): a verified token with an email
    # auto-creates the local user on first login, keyed by email so a later IdP
    # swap (#97) re-links instead of duplicating. No email-domain gate — the org
    # Keycloak is the access boundary. Stubbed token is "<sub>||<email>" (see
    # test_helper).
    class JitProvisioningTest < ActionDispatch::IntegrationTest
      setup do
        @company, _ = setup_company(name: "ODT") # ensures Company.first exists
      end

      def auth_email(sub, email)
        { "Authorization" => "Bearer #{sub}||#{email}" }
      end

      test "first login provisions a local user regardless of email domain" do
        assert_difference -> { ::Auth::User.count }, 1 do
          get "/api/v1/me", headers: auth_email("kc-sub-1", "newbie@odd.works")
        end
        assert_response :success
        u = ::Auth::User.find_by(external_id: "kc-sub-1")
        assert_equal "newbie@odd.works", u.email
        assert_equal "branch_employee", u.role
        assert_equal @company.id, u.company_id
        assert_equal u.id, json[:user][:id]
      end

      test "provisioned email is lowercased" do
        get "/api/v1/me", headers: auth_email("kc-sub-2", "Mixed@ODD.works")
        assert_response :success
        assert_equal "mixed@odd.works", ::Auth::User.find_by(external_id: "kc-sub-2").email
      end

      test "a token without an email provisions nothing and is unauthorized" do
        assert_no_difference -> { ::Auth::User.count } do
          get "/api/v1/me", headers: auth_email("kc-sub-3", "")
        end
        assert_response :unauthorized
      end

      # #390: the login half of the link. The importer backfills everyone who
      # already exists; this is how someone added to the roster today connects
      # on their first sign-in, with no re-import.
      test "first login links to the person already on the roster" do
        ada = ::Org::Employee.create!(company: @company, email: "ada@odds.team", name: "Ada Lovelace")

        get "/api/v1/me", headers: auth_email("kc-sub-4", "Ada@ODDS.team")

        assert_response :success
        assert_equal ada, ::Auth::User.find_by(external_id: "kc-sub-4").employee
      end

      test "an email that is not on the roster provisions unlinked and is not blocked" do
        get "/api/v1/me", headers: auth_email("kc-sub-5", "contractor@elsewhere.test")

        assert_response :success
        assert_nil ::Auth::User.find_by(external_id: "kc-sub-5").employee_id
      end

      test "a returning user re-links by email when their subject changes" do
        existing = @company.users.create!(name: "Carol", role: "branch_manager",
          external_id: "old-sub", email: "carol@odds.team")
        assert_no_difference -> { ::Auth::User.count } do
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
