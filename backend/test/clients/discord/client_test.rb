require "test_helper"

module Discord
  # OAuth code → Discord identity (#568). Discord stubbed at the HTTP boundary,
  # same shape as Eira::ClientTest.
  class ClientTest < ActiveSupport::TestCase
    def stub_http(*responses)
      calls = []
      transport = ->(method, url, headers, body) {
        calls << { method:, url:, headers:, body: }
        responses[calls.size - 1]
      }
      [ transport, calls ]
    end

    def client(http)
      Client.new(client_id: "app-1", client_secret: "shh", http: http)
    end

    ME = { "id" => "42", "username" => "pim", "global_name" => "Pim" }.freeze

    test "exchanges the code, then asks Discord who the token belongs to" do
      http, calls = stub_http([ 200, { "access_token" => "at-1" } ], [ 200, ME ])

      me = client(http).identify("code-1")

      token_call, me_call = calls
      assert_equal "https://discord.com/api/oauth2/token", token_call[:url]
      assert_equal({ "client_id" => "app-1", "client_secret" => "shh",
                     "grant_type" => "authorization_code", "code" => "code-1" },
                   URI.decode_www_form(token_call[:body]).to_h)
      assert_equal "https://discord.com/api/v10/users/@me", me_call[:url]
      assert_equal "Bearer at-1", me_call[:headers]["Authorization"]
      assert_equal ME.merge("access_token" => "at-1"), me
    end

    test "a rejected code raises" do
      http, = stub_http([ 400, { "error" => "invalid_grant" } ])

      assert_raises(Client::Error) { client(http).identify("bad") }
    end

    test "an unconfigured app raises without calling Discord" do
      http, calls = stub_http
      assert_raises(Client::Error) do
        Client.new(client_id: "", client_secret: "", http: http).identify("c")
      end
      assert_empty calls
    end

    def bot(http)
      Client.new(client_id: "app-1", client_secret: "shh", bot_token: "bot-1", http: http)
    end

    test "finds a guild's voice channel by name inclusion, ignoring case and text channels" do
      http, calls = stub_http([ 200, [ { "id" => "t1", "type" => 0, "name" => "meeting room" },
                                     { "id" => "v1", "type" => 2, "name" => "🗣 Meeting Room" } ] ])

      assert_equal "v1", bot(http).voice_channel("g1", "meeting ROOM")["id"]
      assert_equal "https://discord.com/api/v10/guilds/g1/channels", calls[0][:url]
      assert_equal "Bot bot-1", calls[0][:headers]["Authorization"]
    end

    test "no matching voice channel (or a blank name) is nil" do
      lounge = [ 200, [ { "id" => "v1", "type" => 2, "name" => "Lounge" } ] ]
      http, = stub_http(lounge, lounge)

      assert_nil bot(http).voice_channel("g1", "Meeting Room")
      assert_nil bot(http).voice_channel("g1", " ")
    end

    test "moves a member by PATCHing their channel_id" do
      http, calls = stub_http([ 200, {} ])

      bot(http).move("g1", "u1", "v1")

      assert_equal :patch, calls[0][:method]
      assert_equal "https://discord.com/api/v10/guilds/g1/members/u1", calls[0][:url]
      assert_equal "Bot bot-1", calls[0][:headers]["Authorization"]
      assert_equal({ "channel_id" => "v1" }, JSON.parse(calls[0][:body]))
    end

    test "a refused move raises" do
      http, = stub_http([ 400, { "message" => "Target user is not connected to voice." } ])

      assert_raises(Client::Error) { bot(http).move("g1", "u1", "v1") }
    end

    test "no bot token raises without calling Discord" do
      http, calls = stub_http
      assert_raises(Client::Error) { client(http).voice_channel("g1", "Meeting Room") }
      assert_empty calls
    end
  end
end
