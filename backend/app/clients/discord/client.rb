require "net/http"
require "json"
require "uri"

# Discord REST for the Activity. Sign-in (#568): the browser only ever holds
# the one-shot code; we exchange it with our client secret and ask Discord who
# the resulting token belongs to — the client never tells us its own id.
# Meeting moves (#571): the bot token lists a guild's voice channels and moves
# a member between them. The transport is injectable, same as Eira::Client:
# tests stub at the boundary.
module Discord
  class Client
    class Error < StandardError; end

    TOKEN_URL = "https://discord.com/api/oauth2/token".freeze
    API = "https://discord.com/api/v10".freeze
    ME_URL = "#{API}/users/@me".freeze
    VOICE = 2 # Discord channel type GUILD_VOICE

    def self.from_env(env = ENV)
      new(client_id: env["DISCORD_CLIENT_ID"].to_s, client_secret: env["DISCORD_CLIENT_SECRET"].to_s,
          bot_token: env["DISCORD_BOT_TOKEN"].to_s)
    end

    def initialize(client_id:, client_secret:, bot_token: "", http: nil)
      @client_id = client_id
      @client_secret = client_secret
      @bot_token = bot_token
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

    # The guild's first voice channel whose name contains `name`, ignoring
    # case (plan decision 5: zone "Meeting Room" binds "🗣 Meeting Room"); nil
    # when none does. A blank name never matches (it would match everything).
    def voice_channel(guild_id, name)
      status, channels = bot(:get, "#{API}/guilds/#{guild_id}/channels")
      raise Error, "list channels failed (#{status})" unless status == 200 && channels.is_a?(Array)

      needle = name.to_s.strip.downcase
      return nil if needle.empty?

      channels.find { |c| c["type"] == VOICE && c["name"].to_s.downcase.include?(needle) }
    end

    # Needs Move Members in that guild, and the member already in voice.
    def move(guild_id, user_id, channel_id)
      status, = bot(:patch, "#{API}/guilds/#{guild_id}/members/#{user_id}", { channel_id: channel_id }.to_json)
      raise Error, "move failed (#{status})" unless [ 200, 204 ].include?(status)
    end

    private

    def bot(method, url, body = nil)
      raise Error, "Discord bot not configured" if @bot_token.blank?

      @http.call(method, url, { "Authorization" => "Bot #{@bot_token}", "Content-Type" => "application/json" }, body)
    end

    REQUESTS = { get: Net::HTTP::Get, post: Net::HTTP::Post, patch: Net::HTTP::Patch }.freeze

    def net_http(method, url, headers, body)
      uri = URI(url)
      request = REQUESTS.fetch(method).new(uri, headers)
      request.body = body if body
      res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 10) { |h| h.request(request) }
      json = begin
        JSON.parse(res.body)
      rescue JSON::ParserError, TypeError
        {}
      end
      # The channel list is an Array; everything else we read is a Hash.
      [ res.code.to_i, json.is_a?(Hash) || json.is_a?(Array) ? json : {} ]
    end
  end
end
