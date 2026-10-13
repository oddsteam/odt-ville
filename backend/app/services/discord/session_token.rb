# Our own session for a Discord-shell player (#568). The Activity has no
# Keycloak, so /api/v1/discord/session hands back this signed token instead.
# It rides the same `Authorization: Bearer` / `?token=` seams as a Keycloak
# JWT: ApplicationController's default claims_resolver tries it first, so REST
# and ActionCable accept it with no other change.
module Discord
  module SessionToken
    PREFIX = "dsc.".freeze
    TTL = 12.hours

    def self.issue(user)
      PREFIX + verifier.generate({ "sub" => user.external_id }, expires_in: TTL)
    end

    # nil when the token isn't ours (let Keycloak try it); raises the
    # resolver's Error when it is ours but bad, so callers 401 / reject.
    def self.claims(token)
      return nil unless token.start_with?(PREFIX)

      data = verifier.verified(token.delete_prefix(PREFIX))
      raise Auth::KeycloakAuthenticator::Error, "invalid discord session" unless data

      Auth::KeycloakAuthenticator::Claims.new(subject: data["sub"], roles: [], groups: [], email: nil)
    end

    def self.verifier
      Rails.application.message_verifier("discord_session")
    end
  end
end
