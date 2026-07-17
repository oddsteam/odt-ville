require "net/http"
require "json"
require "cgi"

# The server-only glue that drives the posture-login Verification loop
# (issue #24, posture-login ADR-0005). Ports the shape of that repo's
# unit-tested examples/demo-game-app/gate.ts: start a Verification, then read
# its result server-to-server, holding the client_secret here on the backend.
# The HTTP transport is injectable so the glue is testable with the service
# stubbed at the boundary.
#
# Lives under the Posture domain module (ADR-0010); the client directory was
# renamed from `posture_login/` to `posture/` so the namespace mirrors the
# other modules.
module Posture
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
      service_url = env.fetch("POSTURE_SERVICE_URL", "http://localhost:3000")
      new(
        service_url: service_url,
        # The browser-reachable base for hosted_url. Equals service_url in a
        # normal deploy (single public URL); locally the backend reaches the
        # service over a different host than the browser, so set it to the
        # browser's URL (e.g. http://localhost:3000).
        public_url: env.fetch("POSTURE_PUBLIC_URL", service_url),
        client_id: env.fetch("POSTURE_CLIENT_ID", "dev-game-app"),
        client_secret: env.fetch("POSTURE_CLIENT_SECRET", "dev-secret-do-not-use-in-prod")
      )
    end

    def initialize(service_url:, client_id:, client_secret:, public_url: nil, http: nil)
      @service_url = service_url.chomp("/")
      @public_url = (public_url || service_url).chomp("/")
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

      { session_id: json["session_id"], hosted_url: browser_url(json["hosted_url"]) }
    end

    # List the posture sets this game app can gate against (issue #38), so the
    # admin dropdown can show real sets. Server-to-server with our creds;
    # returns [{ id:, name: }] (the client_secret never reaches the browser).
    def list_posture_sets
      status, json = @http.call(:post, url("/api/posture-sets"), {
        client_id: @client_id,
        client_secret: @client_secret
      })
      raise Error, "list-posture-sets failed: HTTP #{status}" unless status == 200

      Array((json || {})["posture_sets"]).map { |s| { id: s["id"], name: s["name"] } }
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

    # Swap the hosted_url's origin for the browser-reachable public base, keeping
    # its path + query. No-op when public_url == the service's own origin.
    def browser_url(hosted)
      u = URI.parse(hosted)
      b = URI.parse(@public_url)
      u.scheme, u.host, u.port = b.scheme, b.host, b.port
      u.to_s
    rescue URI::InvalidURIError
      hosted
    end

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
