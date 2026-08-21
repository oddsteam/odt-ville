require "test_helper"

module Api
  module V1
    class MeControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company(name: "ODT", user_name: "Alice")
      end

      test "a valid bearer token resolves to the matching local user" do
        get "/api/v1/me", headers: auth(@user)

        assert_response :success
        assert_equal @user.id, json[:user][:id]
        assert_equal @company.id, json[:company][:id]
      end

      # Presence (#88): frames carry the stable Keycloak id, so the client
      # needs its own to tell its echo apart from other players.
      test "the response carries the caller's stable Keycloak id" do
        get "/api/v1/me", headers: auth(@user)

        assert_response :success
        assert_equal @user.external_id, json[:user][:external_id]
      end

      # Avatars (#320, ADR-0012): Basecamp's stored URL is a signed capability
      # token, so the viewer only ever sees our own proxy path — stable across
      # rotations and keyed by the id presence frames already carry.
      test "a stored avatar serializes as the proxy path, never the stored url" do
        @user.update!(avatar_url: "https://example.test/face.png")

        get "/api/v1/me", headers: auth(@user)

        assert_response :success
        assert_equal "/api/v1/users/#{@user.external_id}/avatar", json[:user][:avatar_url]
      end

      test "a user with no stored avatar serializes a null avatar_url" do
        get "/api/v1/me", headers: auth(@user)

        assert_response :success
        assert_nil json[:user][:avatar_url]
      end

      test "the response carries the caller's realm roles" do
        get "/api/v1/me", headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal ["admin"], json[:roles]
      end

      test "roles default to an empty list when the token carries none" do
        get "/api/v1/me", headers: auth(@user)

        assert_response :success
        assert_equal [], json[:roles]
      end

      # #429: the app becomes a source of authorization roles. The gate reads
      # the union of the token's realm roles and the caller's user_roles grants,
      # so a DB grant reaches /me (and the gate) with no re-login.
      test "the response merges DB-granted roles with the token's realm roles" do
        ::Auth::UserRole.create!(user: @user, role: "curator")

        get "/api/v1/me", headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal %w[admin curator], json[:roles].sort
      end

      # A grant the token already carries must not double up in the merged list.
      test "a DB grant that duplicates a realm role is de-duplicated" do
        ::Auth::UserRole.create!(user: @user, role: "admin")

        get "/api/v1/me", headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal ["admin"], json[:roles]
      end

      test "a request with no bearer token is rejected with 401" do
        get "/api/v1/me"

        assert_response :unauthorized
      end

      test "a token whose subject matches no local user is rejected with 401" do
        get "/api/v1/me", headers: { "Authorization" => "Bearer no-such-subject" }

        assert_response :unauthorized
      end

      # Client onboarding (#500): a Client pre-provisioned by email (external_id
      # nil, external true, client_site set) is matched on their first login by
      # email — the sub is stamped, and the app-assigned external/client_site
      # survive (classify_external! is a no-op once external is set, ADR-0020).
      test "a pre-provisioned client is matched by email on first login" do
        client = @company.users.create!(name: "cleo", role: "branch_employee",
                                        email: "cleo@client.test", external: true,
                                        client_site: "KTB")
        assert_nil client.external_id

        # Token is "<sub>|<roles>|<email>": a brand-new sub carrying the email.
        get "/api/v1/me", headers: { "Authorization" => "Bearer new-sub||cleo@client.test" }

        assert_response :success
        assert_equal client.id, json[:user][:id]
        client.reload
        assert_equal "new-sub", client.external_id
        assert_equal true, client.external
        assert_equal "KTB", client.client_site
      end
    end
  end
end
