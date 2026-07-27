require "test_helper"

module Eira
  # Bulk card read (#318). Eira stubbed at the HTTP boundary, same shape as
  # Basecamp::ClientTest — the transport records every call and replays canned
  # responses, so batching and the degrade-to-blank path are driven end to end.
  class ClientTest < ActiveSupport::TestCase
    def stub_http(*responses)
      calls = []
      transport = ->(url, headers, body) {
        calls << { url:, headers:, body: }
        responses[calls.size - 1] || responses.last
      }
      [ transport, calls ]
    end

    def client(http, token: "shh", base_url: "http://localhost:3150")
      Client.new(token: token, base_url: base_url, http: http)
    end

    CARD = { "title" => "Wire up the pathfinder", "status" => "DOING",
             "url" => "https://jira/browse/ONEREV-1" }.freeze

    test "lookup posts the emails to /cards/lookup, authorized by the service token" do
      http, calls = stub_http([ 200, { "a@odds.team" => CARD, "b@odds.team" => nil } ])

      cards = client(http).lookup([ "a@odds.team", "b@odds.team" ])

      assert_equal "http://localhost:3150/cards/lookup", calls.sole[:url]
      assert_equal "Bearer shh", calls.sole[:headers]["Authorization"]
      assert_equal({ "emails" => [ "a@odds.team", "b@odds.team" ] }, JSON.parse(calls.sole[:body]))
      # Null is "no card", not an error and not a gap — it must come back.
      assert_equal({ "a@odds.team" => CARD, "b@odds.team" => nil }, cards)
    end

    # The contract caps a call at 500 addresses, so the batching is the client's
    # business — a caller with a 600-person world just asks for 600.
    test "more than 500 emails are split into batches and merged" do
      emails = (1..501).map { |n| "p#{n}@odds.team" }
      http, calls = stub_http(
        [ 200, { "p1@odds.team" => CARD } ],
        [ 200, { "p501@odds.team" => nil } ]
      )

      cards = client(http).lookup(emails)

      assert_equal [ 500, 1 ], calls.map { |c| JSON.parse(c[:body])["emails"].size }
      assert_equal({ "p1@odds.team" => CARD, "p501@odds.team" => nil }, cards)
    end

    # Cards are ambient: Eira being down means blank badges that self-heal on the
    # next event, never an error surfaced in-world.
    test "a non-200 degrades to no cards" do
      http, = stub_http([ 503, {} ])

      assert_empty client(http).lookup([ "a@odds.team" ])
    end

    test "an unreachable Eira degrades to no cards" do
      http = ->(*) { raise Errno::ECONNREFUSED }

      assert_empty client(http).lookup([ "a@odds.team" ])
    end

    # Fails closed the way the #317 ingest does: no token configured, no call.
    test "an unconfigured service token makes no request at all" do
      http, calls = stub_http([ 200, { "a@odds.team" => CARD } ])

      assert_empty client(http, token: "").lookup([ "a@odds.team" ])
      assert_empty calls
    end

    test "no emails makes no request at all" do
      http, calls = stub_http([ 200, {} ])

      assert_empty client(http).lookup([])
      assert_empty calls
    end
  end
end
