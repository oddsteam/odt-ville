require "test_helper"

module Api
  module V1
    # GET /api/v1/admin/users (#430): the read-only roster behind /admin/users —
    # every login, with each admin badge tagged by its source (App vs Keycloak)
    # so the grant/revoke slices (#431, #432) know which grants are ours to touch.
    class UsersControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @admin = setup_company(user_name: "Test Admin")
      end

      test "returns 401 for an anonymous request" do
        get "/api/v1/admin/users"

        assert_response :unauthorized
      end

      test "returns 403 for a signed-in non-admin" do
        get "/api/v1/admin/users", headers: auth(@admin)

        assert_response :forbidden
      end

      test "a DB admin grant passes the gate without the realm role" do
        ::Auth::UserRole.create!(user: @admin, role: "admin")

        get "/api/v1/admin/users", headers: auth(@admin)

        assert_response :success
      end

      test "an admin gets every user, name-ordered, with id/name/email" do
        @company.users.create!(name: "Zoe Last", role: "branch_employee",
                               external_id: SecureRandom.uuid, email: "zoe@example.test")
        @company.users.create!(name: "Ada First", role: "branch_employee",
                               external_id: SecureRandom.uuid, email: "ada@example.test")

        get "/api/v1/admin/users", headers: auth(@admin, roles: %w[admin])

        assert_response :success
        assert_equal ["Ada First", "Test Admin", "Zoe Last"], json.map { _1[:name] }
        ada = json.find { _1[:name] == "Ada First" }
        assert_equal "ada@example.test", ada[:email]
        assert ada.key?(:id)
      end

      test "an app-granted admin badge is tagged source app for any user" do
        target = @company.users.create!(name: "Gil Granted", role: "branch_employee",
                                        external_id: SecureRandom.uuid, email: "gil@example.test")
        ::Auth::UserRole.create!(user: target, role: "admin")

        get "/api/v1/admin/users", headers: auth(@admin, roles: %w[admin])

        gil = json.find { _1[:name] == "Gil Granted" }
        assert_equal 1, gil[:roles].size
        badge = gil[:roles].first
        assert_equal "admin", badge[:role]
        assert_equal "app", badge[:source]
        # A bootstrap/console grant has no actor; the audit key is still present.
        assert_nil badge[:granted_by]
        assert badge.key?(:granted_at)
      end

      # The audit line the roster shows for an App grant (#431): who issued it
      # and when. Keycloak badges carry neither — they are not our grant.
      test "an app grant carries its granter and grant date for the audit line" do
        granter = @company.users.create!(name: "Ivy Issuer", role: "branch_employee",
                                         external_id: SecureRandom.uuid, email: "ivy@example.test")
        target = @company.users.create!(name: "Gil Granted", role: "branch_employee",
                                        external_id: SecureRandom.uuid, email: "gil@example.test")
        ::Auth::UserRole.create!(user: target, role: "admin", granted_by: granter)

        get "/api/v1/admin/users", headers: auth(@admin, roles: %w[admin])

        badge = json.find { _1[:name] == "Gil Granted" }[:roles].first
        assert_equal "Ivy Issuer", badge[:granted_by]
        assert badge[:granted_at].present?
      end

      test "the requesting user's own Keycloak role is tagged source keycloak" do
        get "/api/v1/admin/users", headers: auth(@admin, roles: %w[admin])

        me = json.find { _1[:name] == "Test Admin" }
        assert_includes me[:roles], { role: "admin", source: "keycloak" }
      end

      # The server can only read the REQUESTING user's token, so another user's
      # Keycloak realm role is unknowable here — their row carries App grants only.
      test "another user's Keycloak role is not visible, only their app grants" do
        @company.users.create!(name: "Ken Keycloak", role: "branch_employee",
                               external_id: SecureRandom.uuid, email: "ken@example.test")

        get "/api/v1/admin/users", headers: auth(@admin, roles: %w[admin])

        ken = json.find { _1[:name] == "Ken Keycloak" }
        assert_equal [], ken[:roles]
      end

      # A roster row carries the two fields the client-onboarding console edits
      # (#500): `external` (Staff vs Client, nullable when never classified) and
      # the app-assigned `client_site`.
      test "a row carries external and client_site" do
        @company.users.create!(name: "Cleo Client", role: "branch_employee",
                               external_id: SecureRandom.uuid, email: "cleo@client.test",
                               external: true, client_site: "KTB")

        get "/api/v1/admin/users", headers: auth(@admin, roles: %w[admin])

        cleo = json.find { _1[:name] == "Cleo Client" }
        assert_equal true, cleo[:external]
        assert_equal "KTB", cleo[:client_site]
      end

      # Pre-provision (#500): create a Client login by email before their first
      # sign-in. external_id stays nil until they log in and are matched by email.
      test "an admin pre-provisions a client by email with external and client_site" do
        assert_difference -> { ::Auth::User.count }, 1 do
          post "/api/v1/admin/users",
               params: { email: "New.Client@client.test", external: true, client_site: "KTB" },
               headers: auth(@admin, roles: %w[admin])
        end

        assert_response :created
        user = ::Auth::User.find_by(email: "new.client@client.test")
        assert_not_nil user
        assert_nil user.external_id
        assert_equal true, user.external
        assert_equal "KTB", user.client_site
        # Name defaults to the email prefix, as first-login provisioning does.
        assert_equal "New.Client", user.name
        assert_equal @company.id, user.company_id
        assert_equal "KTB", json[:client_site]
      end

      test "pre-provision rejects a blank email as a 422, creating nothing" do
        assert_no_difference -> { ::Auth::User.count } do
          post "/api/v1/admin/users", params: { email: "  " },
               headers: auth(@admin, roles: %w[admin])
        end

        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "pre-provision rejects a duplicate email as a 422, creating nothing" do
        @company.users.create!(name: "Dup", role: "branch_employee",
                               external_id: SecureRandom.uuid, email: "dup@client.test")

        assert_no_difference -> { ::Auth::User.count } do
          post "/api/v1/admin/users", params: { email: "Dup@client.test" },
               headers: auth(@admin, roles: %w[admin])
        end

        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      # Edit an existing user (#500): flip external and assign a client_site.
      test "an admin sets external and client_site on an existing user" do
        target = @company.users.create!(name: "Ed Existing", role: "branch_employee",
                                        external_id: SecureRandom.uuid, email: "ed@example.test")

        patch "/api/v1/admin/users/#{target.id}",
              params: { external: true, client_site: "KTB" },
              headers: auth(@admin, roles: %w[admin])

        assert_response :success
        target.reload
        assert_equal true, target.external
        assert_equal "KTB", target.client_site
        assert_equal "KTB", json[:client_site]
      end

      # A blank client_site clears the assignment (presence → nil).
      test "an admin clears client_site with a blank value" do
        target = @company.users.create!(name: "Cl Ear", role: "branch_employee",
                                        external_id: SecureRandom.uuid, email: "clear@example.test",
                                        external: true, client_site: "KTB")

        patch "/api/v1/admin/users/#{target.id}",
              params: { client_site: "" }, headers: auth(@admin, roles: %w[admin])

        assert_response :success
        assert_nil target.reload.client_site
        # external untouched — the console can send one field at a time.
        assert_equal true, target.external
      end

      test "create and update are admin-gated" do
        post "/api/v1/admin/users", params: { email: "x@client.test" }, headers: auth(@admin)
        assert_response :forbidden

        target = @company.users.create!(name: "T", role: "branch_employee",
                                        external_id: SecureRandom.uuid, email: "t@example.test")
        patch "/api/v1/admin/users/#{target.id}", params: { external: true }, headers: auth(@admin)
        assert_response :forbidden
      end

      test "create and update reject an anonymous request" do
        post "/api/v1/admin/users", params: { email: "x@client.test" }
        assert_response :unauthorized

        patch "/api/v1/admin/users/1", params: { external: true }
        assert_response :unauthorized
      end
    end
  end
end
