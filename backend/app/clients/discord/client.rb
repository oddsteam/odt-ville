require "net/http"
require "json"
require "uri"

# Discord OAuth for the Activity sign-in (#568). The browser only ever holds
# the one-shot code; we exchange it with our client secret and ask Discord who
# the resulting token belongs to — the client never tells us its own id. The
# transport is injectable, same as Eira::Client: tests stub at the boundary.
module Discord
  class Client
    class Error < StandardError; end

    TOKEN_URL = "https://discord.com/api/oauth2/token".freeze
    ME_URL = "https://discord.com/api/v10/users/@me".freeze

    def self.from_env(env = ENV)
      new(client_id: env["DISCORD_CLIENT_ID"].to_s, client_secret: env["DISCORD_CLIENT_SECRET"].to_s)
    end

    def initialize(client_id:, client_secret:, http: nil)
      @client_id = client_id
      @client_secret = client_secret
      @http = http || method(:net_http)
    end

    # { "id", "username", "global_name", ..., "access_token" } — the access
    # token rides along so the Activity can `authenticate` its SDK with it.
    def identify(code)
      raise Error, "Discord app not configured" if @client_id.blank? || @client_secret.blank?

      body = URI.encode_www_form(client_id: @client_id, client_secret: @client_secret,
                                 grant_type: "authorization_code", code: code.to_s)
      status, token = @http.call(:post, TOKEN_URL, { "Content-Type" => "application/x-www-form-urlencoded" }, body)
      raise Error, "code exchange failed (#{status})" unless status == 200 && token["access_token"]

      status, me = @http.call(:get, ME_URL, { "Authorization" => "Bearer #{token['access_token']}" }, nil)
      raise Error, "users/@me failed (#{status})" unless status == 200 && me["id"]

      me.merge("access_token" => token["access_token"])
    end

    private

    def net_http(method, url, headers, body)
      uri = URI(url)
      request = (method == :post ? Net::HTTP::Post : Net::HTTP::Get).new(uri, headers)
      request.body = body if body
      res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 10) { |h| h.request(request) }
      json = begin
        JSON.parse(res.body)
      rescue JSON::ParserError, TypeError
        {}
      end
      [ res.code.to_i, json.is_a?(Hash) ? json : {} ]
    end
  end
end
