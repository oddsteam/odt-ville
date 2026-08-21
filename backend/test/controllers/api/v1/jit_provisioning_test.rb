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

      # --- Staff / Client classification (#498) --------------------------------

      test "a staff-domain login is provisioned as not external" do
        @company.company_domains.create!(domain: "odds.team")

        get "/api/v1/me", headers: auth_email("kc-sub-staff", "ada@ODDS.team")

        assert_response :success
        assert_equal false, ::Auth::User.find_by(external_id: "kc-sub-staff").external
      end

      test "an unknown-domain login is provisioned external, fail-closed" do
        @company.company_domains.create!(domain: "odds.team")

        get "/api/v1/me", headers: auth_email("kc-sub-client", "guest@acme.example")

        assert_response :success
        assert_equal true, ::Auth::User.find_by(external_id: "kc-sub-client").external
      end

      test "existing staff resolve to not external on next login" do
        @company.company_domains.create!(domain: "odds.team")
        staff = @company.users.create!(name: "Carol", role: "branch_manager",
          external_id: "kc-sub-return", email: "carol@odds.team", external: nil)

        get "/api/v1/me", headers: auth_email("kc-sub-return", "carol@odds.team")

        assert_response :success
        assert_equal false, staff.reload.external
      end

      test "a set external flag is preserved on next login (admin-flippable)" do
        @company.company_domains.create!(domain: "odds.team")
        # An admin marked this staff-domain user external; the login must not
        # re-classify and undo the flip.
        flipped = @company.users.create!(name: "Dana", role: "branch_employee",
          external_id: "kc-sub-flip", email: "dana@odds.team", external: true)

        get "/api/v1/me", headers: auth_email("kc-sub-flip", "dana@odds.team")

        assert_response :success
        assert_equal true, flipped.reload.external
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
