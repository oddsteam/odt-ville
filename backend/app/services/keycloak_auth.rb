# Verifies Keycloak (OIDC) access tokens for the API.
#
# POC phase: we run our own Keycloak (see docker-compose.yml). Because every
# value here is read from the environment, swapping in ODT's real company
# Keycloak later is a config change only — set KEYCLOAK_ISSUER (and optionally
# KEYCLOAK_AUDIENCE) to the real server and nothing in the code changes.
#
# What "verify" checks:
#   - RS256 signature against the realm's published JWKS (fetched + cached)
#   - issuer matches KEYCLOAK_ISSUER
#   - token not expired
#   - audience: `aud` contains, or `azp` equals, KEYCLOAK_AUDIENCE
require "net/http"
require "uri"
require "json"

module KeycloakAuth
  class Error < StandardError; end

  # Issuer URL, e.g. http://localhost:8180/realms/odt
  def self.issuer
    ENV.fetch("KEYCLOAK_ISSUER", "http://localhost:8180/realms/odt")
  end

  # The audience the backend expects. The realm's `odt-frontend` client adds
  # "odt-backend" to the token audience; keycloak-js also sets `azp` to the
  # client id, so either is accepted.
  def self.audience
    ENV.fetch("KEYCLOAK_AUDIENCE", "odt-backend")
  end

  def self.client_id
    ENV.fetch("KEYCLOAK_CLIENT_ID", "odt-frontend")
  end

  def self.jwks_uri
    "#{issuer}/protocol/openid-connect/certs"
  end

  # Decode + fully verify a raw bearer token string. Returns the claims hash,
  # or raises KeycloakAuth::Error with a human-readable reason.
  def self.verify(token)
    raise Error, "missing token" if token.blank?

    claims, _header = JWT.decode(
      token,
      nil,
      true,
      algorithms: ["RS256"],
      iss: issuer,
      verify_iss: true,
      verify_expiration: true,
      jwks: jwks_loader
    )

    verify_audience!(claims)
    claims
  rescue JWT::DecodeError => e
    raise Error, e.message
  end

  # The JWT gem calls this with { invalidate: true } when a token references a
  # key id (kid) we haven't seen — that's the signal to refetch (handles
  # Keycloak key rotation). Cached otherwise.
  def self.jwks_loader
    ->(options) { fetch_jwks(force: options[:invalidate]) }
  end

  def self.fetch_jwks(force: false)
    if force || @jwks.nil? || @jwks_fetched_at.nil? || (Time.now - @jwks_fetched_at) > 600
      @jwks = http_get_json(jwks_uri)
      @jwks_fetched_at = Time.now
    end
    @jwks
  rescue StandardError => e
    raise Error, "could not fetch JWKS from #{jwks_uri}: #{e.message}"
  end

  def self.verify_audience!(claims)
    expected = [audience, client_id].compact
    aud = Array(claims["aud"])
    azp = claims["azp"]
    return if (aud & expected).any?
    return if expected.include?(azp)

    raise Error, "token audience #{aud.inspect}/azp #{azp.inspect} does not match #{expected.inspect}"
  end

  def self.http_get_json(url)
    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = 5
    http.read_timeout = 5
    res = http.get(uri.request_uri)
    raise "HTTP #{res.code}" unless res.is_a?(Net::HTTPSuccess)

    JSON.parse(res.body)
  end
end
