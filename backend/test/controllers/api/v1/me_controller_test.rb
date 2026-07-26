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

      test "a request with no bearer token is rejected with 401" do
        get "/api/v1/me"

        assert_response :unauthorized
      end

      test "a token whose subject matches no local user is rejected with 401" do
        get "/api/v1/me", headers: { "Authorization" => "Bearer no-such-subject" }

        assert_response :unauthorized
      end
    end
  end
end
