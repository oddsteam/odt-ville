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
        Auth::UserRole.create!(user: @admin, role: "admin")

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
        Auth::UserRole.create!(user: target, role: "admin")

        get "/api/v1/admin/users", headers: auth(@admin, roles: %w[admin])

        gil = json.find { _1[:name] == "Gil Granted" }
        assert_equal [{ role: "admin", source: "app" }], gil[:roles]
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
    end
  end
end
