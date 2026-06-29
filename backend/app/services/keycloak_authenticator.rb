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
class KeycloakAuthenticator
  Error = Class.new(StandardError)

  # The app-wide verifier, configured from the environment and memoised so the
  # JWKS cache is shared across requests.
  def self.instance
    @instance ||= from_env
  end

  # For tests: drop the memoised instance so the next call rebuilds from ENV.
  def self.reset!
    @instance = nil
  end

  def self.from_env(env = ENV)
    issuer = env.fetch("KEYCLOAK_ISSUER", "http://localhost:8080/realms/odtville")
    new(
      issuer: issuer,
      audience: env.fetch("KEYCLOAK_AUDIENCE", "odt-ville-web"),
      jwks_uri: env["KEYCLOAK_JWKS_URI"]
    )
  end

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

  # Returns the verified claims hash, or raises Error. Pinning `algorithms` to
  # RS256 is deliberate — it blocks "alg":"none" and HS256 confusion attacks.
  def verify(token)
    raise Error, "missing bearer token" if token.to_s.strip.empty?

    payload, _header = JWT.decode(token, nil, true,
      algorithms: [ "RS256" ],
      jwks: ->(opts) { jwks(force: opts[:invalidate]) },
      iss: @issuer, verify_iss: true,
      aud: @audience, verify_aud: true,
      verify_expiration: true)
    payload
  rescue JWT::Error => e
    raise Error, e.message
  end

  private

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
