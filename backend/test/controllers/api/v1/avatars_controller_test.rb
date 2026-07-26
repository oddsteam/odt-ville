require "test_helper"

module Api
  module V1
    # The stable avatar path (#320, ADR-0012). The stored URL is a signed
    # capability token, so the browser only ever talks to this endpoint — which
    # means it must answer without a bearer token (an <img> can't send one) and
    # must degrade to 404 rather than a broken upstream error.
    class AvatarsControllerTest < ActionDispatch::IntegrationTest
      setup do
        _company, @user = setup_company(user_name: "Alice")
        @fetched = []
        @original_fetcher = Api::V1::Auth::AvatarsController.fetcher
      end

      teardown do
        Api::V1::Auth::AvatarsController.fetcher = @original_fetcher
      end

      test "it streams the bytes behind the user's stored url, unauthenticated" do
        @user.update!(avatar_url: "https://example.test/face.png")
        stub_fetch { |url| @fetched << url and [ "PNGBYTES", "image/png" ] }

        get "/api/v1/users/#{@user.external_id}/avatar"

        assert_response :success
        assert_equal "PNGBYTES", response.body
        assert_equal "image/png", response.media_type
        assert_equal [ "https://example.test/face.png" ], @fetched
      end

      test "a user with no stored avatar is a 404, not an error" do
        stub_fetch { |_url| raise "must not fetch" }

        get "/api/v1/users/#{@user.external_id}/avatar"

        assert_response :not_found
      end

      test "an unknown external_id is a 404" do
        get "/api/v1/users/nobody/avatar"

        assert_response :not_found
      end

      # A rotated Basecamp URL 404s upstream between syncs (ADR-0012): that has
      # to read as "no avatar" so the header shows its fallback, not a broken img.
      test "an upstream that refuses degrades to the same 404" do
        @user.update!(avatar_url: "https://example.test/stale.png")
        stub_fetch { |_url| raise OpenURI::HTTPError.new("404 Not Found", nil) }

        get "/api/v1/users/#{@user.external_id}/avatar"

        assert_response :not_found
      end

      private

      def stub_fetch(&block)
        Api::V1::Auth::AvatarsController.fetcher = block
      end
    end
  end
end
