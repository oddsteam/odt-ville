require "net/http"
require "json"
require "uri"

# Server-only Basecamp 5 access (issue #319, ADR-0012). Holds the OAuth 2 app
# credentials on the backend and turns the long-lived refresh token into a
# short-lived access token; nothing here ever reaches the browser.
#
# The one-time authorization-code hop is a human step — see ADR-0012 for how to
# produce BASECAMP_REFRESH_TOKEN and BASECAMP_ACCOUNT_ID. Basecamp rejects any
# request without a User-Agent naming the app and a contact address.
#
# The HTTP transport is injectable so the OAuth dance is testable with Basecamp
# stubbed at the boundary, exactly like Posture::Client.
module Basecamp
  class Client
    Error = Class.new(StandardError)

    LAUNCHPAD = "https://launchpad.37signals.com".freeze
    API = "https://3.basecampapi.com".freeze
    DEFAULT_USER_AGENT = "ODT Ville (zacrify1986@gmail.com)".freeze

    def self.from_env(env = ENV)
      new(
        client_id: env.fetch("BASECAMP_CLIENT_ID"),
        client_secret: env.fetch("BASECAMP_CLIENT_SECRET"),
        refresh_token: env.fetch("BASECAMP_REFRESH_TOKEN"),
        account_id: env.fetch("BASECAMP_ACCOUNT_ID"),
        user_agent: env.fetch("BASECAMP_USER_AGENT", DEFAULT_USER_AGENT)
      )
    end

    attr_reader :user_agent

    def initialize(client_id:, client_secret:, refresh_token:, account_id:,
                   user_agent: DEFAULT_USER_AGENT, http: nil)
      @client_id = client_id
      @client_secret = client_secret
      @refresh_token = refresh_token
      @account_id = account_id
      @user_agent = user_agent
      @http = http || method(:net_http)
    end

    # GET a Basecamp API path (e.g. "people.json") under our account, authorized.
    # Returns the parsed JSON body; raises unless Basecamp answers 200.
    def get(path)
      status, json = @http.call(:get, "#{API}/#{@account_id}/#{path}", auth_headers)
      raise Error, "GET #{path} failed: HTTP #{status}" unless status == 200

      json
    end

    # Access tokens last ~2 weeks; minting once per client instance keeps a sync
    # to a single auth request. ponytail: no expiry tracking — build a client per
    # sync run. Add refresh-on-401 if a long-lived process ever holds one.
    def access_token
      @access_token ||= mint_access_token
    end

    private

    def mint_access_token
      status, json = @http.call(:post, token_url, { "User-Agent" => @user_agent })
      raise Error, "token refresh failed: HTTP #{status}" unless status == 200

      (json || {})["access_token"] or raise Error, "token refresh returned no access_token"
    end

    def token_url
      query = URI.encode_www_form(
        type: "refresh",
        refresh_token: @refresh_token,
        client_id: @client_id,
        client_secret: @client_secret
      )
      "#{LAUNCHPAD}/authorization/token?#{query}"
    end

    def auth_headers
      { "Authorization" => "Bearer #{access_token}", "User-Agent" => @user_agent }
    end

    # Default transport. A non-JSON body parses to {} so a surprise error page
    # surfaces as the HTTP status rather than a parser crash.
    def net_http(method, url, headers)
      uri = URI(url)
      request = (method == :post ? Net::HTTP::Post : Net::HTTP::Get).new(uri, headers)
      res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https") { |h| h.request(request) }
      json = begin
        JSON.parse(res.body)
      rescue JSON::ParserError, TypeError
        {}
      end
      [ res.code.to_i, json ]
    end
  end
end
