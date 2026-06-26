require "net/http"
require "json"
require "cgi"

# The server-only glue that drives the posture-login Verification loop
# (issue #24, posture-login ADR-0005). Ports the shape of that repo's
# unit-tested examples/demo-game-app/gate.ts: start a Verification, then read
# its result server-to-server, holding the client_secret here on the backend.
# The HTTP transport is injectable so the glue is testable with the service
# stubbed at the boundary.
module PostureLogin
  class Client
    Error = Class.new(StandardError)

    # The gate opens IFF the authenticated, server-to-server result read
    # returned 200 and the confirmed status is "passed". Anything else —
    # pending, a failure status, 401 (bad creds) or 404 (not ours) — stays shut.
    # The redirect's status param is never trusted; only this read decides.
    def self.granted?(http_status:, status:)
      http_status == 200 && status == "passed"
    end

    # Build a Client from env, with the seeded dev credentials as defaults
    # (posture-login `pnpm db:seed`). Override in any deployed env.
    def self.from_env(env = ENV)
      new(
        service_url: env.fetch("POSTURE_SERVICE_URL", "http://localhost:3000"),
        client_id: env.fetch("POSTURE_CLIENT_ID", "dev-game-app"),
        client_secret: env.fetch("POSTURE_CLIENT_SECRET", "dev-secret-do-not-use-in-prod")
      )
    end

    def initialize(service_url:, client_id:, client_secret:, http: nil)
      @service_url = service_url.chomp("/")
      @client_id = client_id
      @client_secret = client_secret
      @http = http || method(:net_http)
    end

    # Step 1 — start a Verification. Returns the session_id + the hosted_url the
    # shell opens in the user's browser. Raises unless the service returns 201.
    def start_verification(posture_set_id:, callback_url:)
      status, json = @http.call(:post, url("/api/verifications"), {
        client_id: @client_id,
        client_secret: @client_secret,
        posture_set_id: posture_set_id,
        callback_url: callback_url
      })
      raise Error, "start-verification failed: HTTP #{status}" unless status == 201

      { session_id: json["session_id"], hosted_url: json["hosted_url"] }
    end

    # Step 4 — confirm the outcome server-to-server with our credentials.
    # Returns the raw HTTP status + the confirmed status so the caller decides
    # the gate via granted?; we never trust the redirect's status param.
    def read_result(session_id:)
      status, json = @http.call(:post, url("/api/verifications/#{CGI.escapeURIComponent(session_id)}/result"), {
        client_id: @client_id,
        client_secret: @client_secret
      })
      { http_status: status, status: (json || {})["status"] }
    end

    private

    def url(path) = "#{@service_url}#{path}"

    # Default transport — a thin POST-JSON over Net::HTTP. A non-JSON body
    # parses to {} so the gate stays shut rather than raising.
    def net_http(_method, url, body)
      uri = URI(url)
      res = Net::HTTP.post(uri, body.to_json, "content-type" => "application/json")
      json = begin
        JSON.parse(res.body)
      rescue JSON::ParserError, TypeError
        {}
      end
      [ res.code.to_i, json ]
    end
  end
end
