require "net/http"
require "json"
require "uri"

# Server-only read of Eira's card board (#318, ADR-0010). Eira is the store of
# record; odt-ville holds cards in memory for connected clients only, so this
# bulk read is what seeds the picture on world entry — the #317 push events
# carry changes going forward and know nothing of what happened while we were
# down. Like the ingest token, EIRA_SERVICE_TOKEN is service-to-service and
# never reaches the browser.
#
# Eira answers on the homeserver's own loopback, so the default URL has no
# Cloudflare in the path. The transport is injectable for the same reason as
# Basecamp::Client: the boundary is where the tests stub.
module Eira
  class Client
    LOOKUP_PATH = "/cards/lookup".freeze
    # Eira's contract caps a call here, so batching is ours to do, not the
    # caller's — they just ask for the whole world.
    BATCH = 500

    def self.from_env(env = ENV)
      new(
        token: env["EIRA_SERVICE_TOKEN"].to_s,
        base_url: env.fetch("EIRA_URL", "http://localhost:3150")
      )
    end

    def initialize(token:, base_url:, http: nil)
      @token = token
      @base_url = base_url
      @http = http || method(:net_http)
    end

    # { email => { title, status, url } | nil } for every address asked about,
    # keyed by exactly the string we sent. `nil` is "holding no card" — not an
    # error, and indistinguishable from "Eira has never heard of them".
    #
    # Cards are ambient: any failure degrades to an empty result, so badges
    # render blank and self-heal on the next event rather than surfacing an
    # error in-world. Fails closed on a missing token, like the #317 ingest.
    def lookup(emails)
      return {} if @token.blank? || emails.empty?

      emails.each_slice(BATCH).reduce({}) { |all, batch| all.merge(fetch(batch)) }
    end

    private

    def fetch(emails)
      status, json = @http.call(url, headers, JSON.generate(emails: emails))
      status == 200 && json.is_a?(Hash) ? json : {}
    rescue StandardError
      {}
    end

    def url
      "#{@base_url}#{LOOKUP_PATH}"
    end

    def headers
      { "Authorization" => "Bearer #{@token}", "Content-Type" => "application/json" }
    end

    # Short timeouts: this runs inline on the cable thread at world entry, and a
    # slow Eira must cost an arriving player a blank badge, never a hung join.
    def net_http(url, headers, body)
      uri = URI(url)
      request = Net::HTTP::Post.new(uri, headers)
      request.body = body
      res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                            open_timeout: 2, read_timeout: 5) { |h| h.request(request) }
      json = begin
        JSON.parse(res.body)
      rescue JSON::ParserError, TypeError
        {}
      end
      [ res.code.to_i, json ]
    end
  end
end
