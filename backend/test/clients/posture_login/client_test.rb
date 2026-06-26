require "test_helper"

module PostureLogin
  class ClientTest < ActiveSupport::TestCase
    # A stub transport: records the last call and replays a canned response.
    # Lets us drive the glue (request body, result parsing, gate decision)
    # with the posture-login service stubbed at the HTTP boundary, exactly
    # like gate.ts's injectable `fetcher`.
    def stub_http(status:, json: {})
      calls = []
      transport = ->(method, url, body) {
        calls << { method:, url:, body: }
        [ status, json ]
      }
      [ transport, calls ]
    end

    def client(http)
      Client.new(
        service_url: "https://posture.example",
        client_id: "dev-game-app",
        client_secret: "shh",
        http: http
      )
    end

    test "start_verification posts credentials + posture set + callback and returns the session" do
      http, calls = stub_http(status: 201, json: { "session_id" => "sess-1", "hosted_url" => "https://posture.example/v/sess-1" })

      out = client(http).start_verification(posture_set_id: "set-9", callback_url: "https://game.example/posture/callback")

      assert_equal({ session_id: "sess-1", hosted_url: "https://posture.example/v/sess-1" }, out)
      call = calls.sole
      assert_equal :post, call[:method]
      assert_equal "https://posture.example/api/verifications", call[:url]
      assert_equal "dev-game-app", call[:body][:client_id]
      assert_equal "shh", call[:body][:client_secret]
      assert_equal "set-9", call[:body][:posture_set_id]
      assert_equal "https://game.example/posture/callback", call[:body][:callback_url]
    end

    test "start_verification raises when the service does not return 201" do
      http, = stub_http(status: 422, json: { "error" => "bad set" })
      assert_raises(Client::Error) do
        client(http).start_verification(posture_set_id: "set-9", callback_url: "https://game.example/cb")
      end
    end

    test "read_result authenticates server-to-server and returns http status + confirmed status" do
      http, calls = stub_http(status: 200, json: { "status" => "passed", "posture_set_id" => "set-9" })

      out = client(http).read_result(session_id: "sess 1")

      assert_equal({ http_status: 200, status: "passed" }, out)
      call = calls.sole
      assert_equal "https://posture.example/api/verifications/sess%201/result", call[:url]
      assert_equal({ client_id: "dev-game-app", client_secret: "shh" }, call[:body])
    end

    test "granted? opens the gate only on a 200 + passed; everything else stays shut" do
      assert Client.granted?(http_status: 200, status: "passed")
      refute Client.granted?(http_status: 200, status: "pending")
      refute Client.granted?(http_status: 401, status: nil)
      refute Client.granted?(http_status: 404, status: nil)
    end
  end
end
