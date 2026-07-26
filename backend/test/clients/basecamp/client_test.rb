require "test_helper"

module Basecamp
  class ClientTest < ActiveSupport::TestCase
    # A stub transport, same shape as Posture::ClientTest — records every call
    # and replays canned responses, so the OAuth dance is driven with Basecamp
    # stubbed at the HTTP boundary.
    def stub_http(*responses)
      calls = []
      transport = ->(method, url, headers) {
        calls << { method:, url:, headers: }
        responses[calls.size - 1] || responses.last
      }
      [ transport, calls ]
    end

    def client(http, **overrides)
      Client.new(**{
        client_id: "cid", client_secret: "shh", refresh_token: "refresh-1",
        account_id: "999", http: http
      }.merge(overrides))
    end

    test "mints an access token from the stored refresh token" do
      http, calls = stub_http([ 200, { "access_token" => "at-1", "expires_in" => 1209600 } ])

      assert_equal "at-1", client(http).access_token

      call = calls.sole
      assert_equal :post, call[:method]
      uri = URI(call[:url])
      query = URI.decode_www_form(uri.query).to_h
      assert_equal "https://launchpad.37signals.com/authorization/token", "#{uri.scheme}://#{uri.host}#{uri.path}"
      assert_equal "refresh", query["type"]
      assert_equal "refresh-1", query["refresh_token"]
      assert_equal "cid", query["client_id"]
      assert_equal "shh", query["client_secret"]
    end

    test "the access token is minted once and reused, so a sync spends one request on auth" do
      http, calls = stub_http([ 200, { "access_token" => "at-1" } ])
      c = client(http)

      3.times { c.access_token }

      assert_equal 1, calls.size
    end

    test "raises when Basecamp refuses the refresh token" do
      http, = stub_http([ 401, { "error" => "invalid_grant" } ])

      assert_raises(Client::Error) { client(http).access_token }
    end

    test "a GET is account-scoped and carries the bearer token" do
      http, calls = stub_http(
        [ 200, { "access_token" => "at-1" } ],
        [ 200, [ { "email_address" => "a@odd.com" } ] ]
      )

      out = client(http).get("people.json")

      assert_equal [ { "email_address" => "a@odd.com" } ], out
      call = calls.last
      assert_equal :get, call[:method]
      assert_equal "https://3.basecampapi.com/999/people.json", call[:url]
      assert_equal "Bearer at-1", call[:headers]["Authorization"]
    end

    test "every request identifies the app and a contact address, or Basecamp rejects it" do
      http, calls = stub_http([ 200, { "access_token" => "at-1" } ], [ 200, [] ])

      client(http, user_agent: "ODT Ville (ops@example.com)").get("people.json")

      assert_equal [ "ODT Ville (ops@example.com)" ] * 2, calls.map { |c| c[:headers]["User-Agent"] }
    end

    test "raises when a GET is not a 200" do
      http, = stub_http([ 200, { "access_token" => "at-1" } ], [ 429, {} ])

      assert_raises(Client::Error) { client(http).get("people.json") }
    end

    test "from_env reads the provisioned credentials and defaults the User-Agent" do
      env = {
        "BASECAMP_CLIENT_ID" => "cid", "BASECAMP_CLIENT_SECRET" => "shh",
        "BASECAMP_REFRESH_TOKEN" => "refresh-1", "BASECAMP_ACCOUNT_ID" => "999"
      }

      c = Client.from_env(env)

      assert_match(/\(.+@.+\)/, c.user_agent, "Basecamp requires an app name plus a contact address")
      assert_raises(KeyError) { Client.from_env(env.except("BASECAMP_REFRESH_TOKEN")) }
    end
  end
end
