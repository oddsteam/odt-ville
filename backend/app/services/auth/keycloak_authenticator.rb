require "jwt"
require "net/http"
require "json"

# Verifies a Keycloak-issued bearer token (issue #92, part of #79).
#
# A token is trusted IFF its RS256 signature checks out against the realm's
# published JWKS *and* its `iss`/`aud`/`exp` claims match. The realm's signing
# keys are fetched from the JWKS endpoint and cached so we don't re-fetch on
# every request; the cache self-heals — after `cache_ttl` seconds, and
# immediately when a token presents an unknown `kid` (key rotation).
#
# The transport (`jwks_loader`) is injectable so the verifier is unit-testable
# with a locally-minted keypair and no running Keycloak.
module Auth
  class KeycloakAuthenticator
    Error = Class.new(StandardError)

    # The slice of a verified token the app authorizes on: who they are plus the
    # realm/client roles and groups Keycloak stamped into the token (#94), and the
    # email used to JIT-provision/relink a local user on first login (#96).
    Claims = Struct.new(:subject, :roles, :groups, :email, keyword_init: true)

    # The app-wide verifier, configured from the environment and memoised so the
    # JWKS cache is shared across requests.
    def self.instance
      @instance ||= from_env
    end

    # For tests: drop the memoised instance so the next call rebuilds from ENV.
    def self.reset!
      @instance = nil
    end

    # One verifier per configured realm: KEYCLOAK_EXTERNAL_ISSUER (#539) adds a
    # second trusted realm behind an IssuerRouter; without it, the single
    # verifier is returned as before.
    def self.from_env(env = ENV)
      issuer = env.fetch("KEYCLOAK_ISSUER", "http://localhost:8080/realms/odtville")
      audience = env.fetch("KEYCLOAK_AUDIENCE", "odt-ville-web")
      primary = new(issuer: issuer, audience: audience, jwks_uri: env["KEYCLOAK_JWKS_URI"])

      external_issuer = env["KEYCLOAK_EXTERNAL_ISSUER"].to_s
      return primary if external_issuer.strip.empty?

      external = new(
        issuer: external_issuer,
        audience: env.fetch("KEYCLOAK_EXTERNAL_AUDIENCE", audience),
        jwks_uri: env["KEYCLOAK_EXTERNAL_JWKS_URI"]
      )
      IssuerRouter.new([ primary, external ])
    end

    # The normalized issuer, exposed so IssuerRouter can key verifiers by realm.
    attr_reader :issuer

    def initialize(issuer:, audience:, jwks_uri: nil, jwks_loader: nil, cache_ttl: 600)
      @issuer = issuer.to_s.chomp("/")
      @audience = audience
      @jwks_uri = jwks_uri || "#{@issuer}/protocol/openid-connect/certs"
      @jwks_loader = jwks_loader || -> { fetch_jwks(@jwks_uri) }
      @cache_ttl = cache_ttl
    end

    # The verified `sub` claim, or raises Error if the token is missing/invalid.
    def subject(token)
      verify(token)["sub"] or raise Error, "token has no subject claim"
    end

    # The verified subject + roles + groups (#94). Realm roles
    # (`realm_access.roles`) and this client's roles (`resource_access[aud].roles`)
    # are flattened into one `roles` list; `groups` mirrors the optional group
    # claim. Raises Error on an invalid token, same as `verify`.
    def claims(token)
      payload = verify(token)
      realm = payload.dig("realm_access", "roles") || []
      client = payload.dig("resource_access", @audience, "roles") || []
      Claims.new(
        subject: payload["sub"],
        roles: (realm + client).uniq,
        groups: Array(payload["groups"]),
        email: payload["email"]
      )
    end

    # Returns the verified claims hash, or raises Error. Pinning `algorithms` to
    # RS256 is deliberate — it blocks "alg":"none" and HS256 confusion attacks.
    # Audience is checked by us (see verify_audience!), not the jwt gem, so we can
    # accept `azp` as well as `aud`.
    def verify(token)
      raise Error, "missing bearer token" if token.to_s.strip.empty?

      payload, _header = JWT.decode(token, nil, true,
        algorithms: [ "RS256" ],
        jwks: ->(opts) { jwks(force: opts[:invalidate]) },
        iss: @issuer, verify_iss: true,
        verify_expiration: true)
      verify_audience!(payload)
      payload
    rescue JWT::DecodeError => e
      # JWT::DecodeError is the base of the whole verify/decode/JWKS error family
      # in ruby-jwt 2.x (there is no `JWT::Error` constant). Catching it turns any
      # bad token — malformed, wrong signature, unknown kid, expired, wrong
      # iss — into our Error so callers reject with 401 instead of 500.
      raise Error, e.message
    end

    private

    # This token is for us if either `aud` includes our client (the Audience mapper
    # the org Keycloak should stamp) OR `azp` is our client. Keycloak sets `azp` to
    # the client the token was issued for, and public-SPA tokens routinely ship an
    # `aud` that omits the client (it lists other resource servers instead), so
    # `azp` is the standard, safe fallback — a token minted for a different client
    # carries a different `azp` and is still rejected.
    def verify_audience!(payload)
      aud = Array(payload["aud"])
      return if aud.include?(@audience) || payload["azp"] == @audience

      raise Error, "token audience #{aud.inspect} / azp #{payload["azp"].inspect} " \
        "is not #{@audience.inspect}"
    end

    # JWKS as a `{ keys: [...] }` hash (symbol keys, as the jwt gem expects),
    # cached for `cache_ttl` seconds. `force` bypasses the cache so the jwt gem
    # can recover from key rotation when it sees an unknown `kid`.
    def jwks(force: false)
      if force || @jwks_cache.nil? || cache_expired?
        @jwks_cache = @jwks_loader.call
        @jwks_fetched_at = monotonic
      end
      @jwks_cache
    end

    def cache_expired?
      @cache_ttl.to_i.positive? && (monotonic - @jwks_fetched_at) > @cache_ttl
    end

    def monotonic
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def fetch_jwks(uri)
      res = Net::HTTP.get_response(URI(uri))
      raise Error, "JWKS fetch failed: HTTP #{res.code}" unless res.is_a?(Net::HTTPSuccess)

      JSON.parse(res.body, symbolize_names: true)
    rescue JSON::ParserError, SocketError, SystemCallError, Timeout::Error => e
      raise Error, "JWKS fetch error: #{e.message}"
    end
  end
end
