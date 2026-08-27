require "jwt"

# Routes a bearer token to the verifier for its realm (#539). With external
# client users in a second Keycloak realm, the backend must trust tokens from
# both — each realm has its own issuer and signing keys, so one
# KeycloakAuthenticator per realm, picked by the token's `iss`.
#
# The `iss` peek decodes WITHOUT verification, and is used only to select a
# verifier — never trusted. The selected KeycloakAuthenticator then does the
# full signature + iss/aud/exp verification, so a forged `iss` either misses
# the table (rejected here) or fails that realm's signature check.
module Auth
  class IssuerRouter
    def initialize(authenticators)
      @by_issuer = authenticators.to_h { |a| [ a.issuer, a ] }
    end

    def subject(token)
      authenticator_for(token).subject(token)
    end

    def claims(token)
      authenticator_for(token).claims(token)
    end

    private

    def authenticator_for(token)
      raise KeycloakAuthenticator::Error, "missing bearer token" if token.to_s.strip.empty?

      payload, _header = JWT.decode(token, nil, false)
      iss = payload["iss"].to_s.chomp("/")
      @by_issuer.fetch(iss) do
        raise KeycloakAuthenticator::Error, "unknown token issuer #{iss.inspect}"
      end
    rescue JWT::DecodeError => e
      raise KeycloakAuthenticator::Error, e.message
    end
  end
end
