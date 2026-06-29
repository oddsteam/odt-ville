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
