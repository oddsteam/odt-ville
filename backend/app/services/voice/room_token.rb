require "livekit"

module Voice
  # Mints a LiveKit room token (ADR-0011, #308). The api secret never leaves the
  # server — this is the only place a token is minted, never the browser. The
  # grant is scoped to a single room and only permits joining it.
  class RoomToken
    def self.mint(identity:, name:, room:,
                  api_key: ENV["LIVEKIT_API_KEY"], api_secret: ENV["LIVEKIT_API_SECRET"])
      token = LiveKit::AccessToken.new(api_key: api_key, api_secret: api_secret)
      token.identity = identity
      token.name = name
      token.add_grant(LiveKit::VideoGrant.new(roomJoin: true, room: room))
      token.to_jwt
    end
  end
end
