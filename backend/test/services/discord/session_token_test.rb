require "test_helper"

module Discord
  # Our own session for Discord-shell players (#568). Unit-tested directly:
  # test_helper replaces ApplicationController.claims_resolver suite-wide, so
  # request tests never reach the real resolver chain.
  class SessionTokenTest < ActiveSupport::TestCase
    User = Struct.new(:external_id)

    test "an issued token resolves back to the user's subject" do
      token = SessionToken.issue(User.new("discord:42"))

      assert token.start_with?("dsc.")
      assert_equal "discord:42", SessionToken.claims(token).subject
      assert_equal [], SessionToken.claims(token).roles
    end

    test "a session outlasts a working week of keeping the Activity open" do
      token = SessionToken.issue(User.new("discord:42"))

      travel 6.days do
        assert_equal "discord:42", SessionToken.claims(token).subject
      end
    end

    test "a token that isn't ours is passed over (nil), so Keycloak gets it" do
      assert_nil SessionToken.claims("eyJhbGciOiJSUzI1NiJ9.x.y")
    end

    test "a tampered or expired dsc. token is rejected, not passed over" do
      token = SessionToken.issue(User.new("discord:42"))

      assert_raises(Auth::KeycloakAuthenticator::Error) { SessionToken.claims("#{token}x") }
      travel 8.days do
        assert_raises(Auth::KeycloakAuthenticator::Error) { SessionToken.claims(token) }
      end
    end
  end
end
