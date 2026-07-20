require "test_helper"

module ApplicationCable
  class ConnectionTest < ActionCable::Connection::TestCase
    include ApiTestHelpers

    # Browsers cannot set an Authorization header on a WebSocket handshake and
    # the JWT lives in JS memory (not a cookie), so the token rides the cable
    # URL as ?token= — verified through the same claims_resolver seam the REST
    # side stubs (see test_helper.rb).
    test "connects and resolves the user from a valid token in the query string" do
      _company, user = setup_company

      connect "/api/cable?token=#{user.external_id}"

      assert_equal user, connection.current_user
    end

    test "roles from the token ride the connection for channel gating" do
      _company, user = setup_company

      connect "/api/cable?token=#{user.external_id}|admin"

      assert_equal ["admin"], connection.current_roles
    end

    test "rejects a handshake with no token" do
      assert_reject_connection { connect "/api/cable" }
    end

    test "rejects a token whose subject matches no local user" do
      assert_reject_connection { connect "/api/cable?token=no-such-subject" }
    end
  end
end
