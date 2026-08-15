require "test_helper"

module Api
  module V1
    # POST /api/v1/admin/users/:id/roles (#431): grant an App admin role from
    # the console. The grant is an auth_user_roles row (#429) stamped with the
    # acting admin, so onboarding a game manager no longer needs kcadm.
    class RolesControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @admin = setup_company(user_name: "Test Admin")
        @target = @company.users.create!(name: "Tara Target", role: "branch_employee",
                                         external_id: SecureRandom.uuid, email: "tara@example.test")
      end

      test "grants admin, stamps the acting admin, and returns the updated row" do
        post "/api/v1/admin/users/#{@target.id}/roles",
             params: { role: "admin" }, headers: auth(@admin, roles: %w[admin])

        assert_response :success
        grant = ::Auth::UserRole.find_by(user: @target, role: "admin")
        assert_not_nil grant
        assert_equal @admin.id, grant.granted_by_id

        badge = json[:roles].find { _1[:source] == "app" }
        assert_equal "admin", badge[:role]
        assert_equal "Test Admin", badge[:granted_by]
        assert badge[:granted_at].present?
      end

      test "re-granting an existing role is idempotent — 200, no duplicate row" do
        ::Auth::UserRole.create!(user: @target, role: "admin", granted_by: @admin)

        assert_no_difference -> { ::Auth::UserRole.count } do
          post "/api/v1/admin/users/#{@target.id}/roles",
               params: { role: "admin" }, headers: auth(@admin, roles: %w[admin])
        end

        assert_response :success
      end

      test "an unknown role is a 422, not a stored row" do
        assert_no_difference -> { ::Auth::UserRole.count } do
          post "/api/v1/admin/users/#{@target.id}/roles",
               params: { role: "wizard" }, headers: auth(@admin, roles: %w[admin])
        end

        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "returns 403 for a signed-in non-admin, and grants nothing" do
        post "/api/v1/admin/users/#{@target.id}/roles",
             params: { role: "admin" }, headers: auth(@admin)

        assert_response :forbidden
        assert_nil ::Auth::UserRole.find_by(user: @target, role: "admin")
      end

      test "returns 401 for an anonymous request" do
        post "/api/v1/admin/users/#{@target.id}/roles", params: { role: "admin" }

        assert_response :unauthorized
      end

      # DELETE /api/v1/admin/users/:id/roles/:role (#432): revoke an App grant,
      # with the guardrails that stop it becoming a lockout or a false "revoked".
      test "revokes an App grant, removes the row, and returns the updated user" do
        ::Auth::UserRole.create!(user: @target, role: "admin", granted_by: @admin)

        assert_difference -> { ::Auth::UserRole.count }, -1 do
          delete "/api/v1/admin/users/#{@target.id}/roles/admin", headers: auth(@admin, roles: %w[admin])
        end

        assert_response :success
        assert_nil ::Auth::UserRole.find_by(user: @target, role: "admin")
        assert_empty json[:roles]
      end

      test "refuses self-revoke with 422 and leaves the grant intact" do
        ::Auth::UserRole.create!(user: @admin, role: "admin", granted_by: @admin)

        assert_no_difference -> { ::Auth::UserRole.count } do
          delete "/api/v1/admin/users/#{@admin.id}/roles/admin", headers: auth(@admin, roles: %w[admin])
        end

        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "revoking a role the user does not hold as an App grant is a 404, not a silent 200" do
        delete "/api/v1/admin/users/#{@target.id}/roles/admin", headers: auth(@admin, roles: %w[admin])

        assert_response :not_found
        assert json[:error].present?
      end

      test "returns 403 for a signed-in non-admin, and revokes nothing" do
        ::Auth::UserRole.create!(user: @target, role: "admin", granted_by: @admin)

        assert_no_difference -> { ::Auth::UserRole.count } do
          delete "/api/v1/admin/users/#{@target.id}/roles/admin", headers: auth(@admin)
        end

        assert_response :forbidden
      end
    end
  end
end
