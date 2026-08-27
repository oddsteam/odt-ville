require "test_helper"
require "jwt"
require "openssl"

class IssuerRouterTest < ActiveSupport::TestCase
  ODT_ISS = "https://kc.example/realms/odt".freeze
  EXT_ISS = "https://kc.example/realms/external".freeze
  AUD = "odt-ville-web".freeze

  setup do
    @odt_rsa, @odt_auth = realm_verifier(ODT_ISS)
    @ext_rsa, @ext_auth = realm_verifier(EXT_ISS)
    @router = Auth::IssuerRouter.new([ @odt_auth, @ext_auth ])
  end

  # A verifier whose JWKS is a fresh local keypair — no running Keycloak.
  def realm_verifier(issuer)
    rsa = OpenSSL::PKey::RSA.generate(2048)
    jwk = JWT::JWK.new(rsa)
    auth = Auth::KeycloakAuthenticator.new(
      issuer: issuer, audience: AUD, jwks_loader: -> { { keys: [ jwk.export ] } }
    )
    [ { rsa: rsa, kid: jwk.kid }, auth ]
  end

  def token(iss:, key:, sub: "subject-123", claims: {})
    payload = {
      iss: iss, aud: AUD, sub: sub,
      iat: Time.now.to_i, exp: Time.now.to_i + 60
    }.merge(claims)
    JWT.encode(payload, key[:rsa], "RS256", { kid: key[:kid] })
  end

  test "verifies a token from each configured realm" do
    assert_equal "subject-123", @router.subject(token(iss: ODT_ISS, key: @odt_rsa))
    assert_equal "subject-123", @router.subject(token(iss: EXT_ISS, key: @ext_rsa))
  end

  test "claims are produced by the matching realm's verifier" do
    t = token(iss: EXT_ISS, key: @ext_rsa, claims: { email: "client@example.com" })
    assert_equal "client@example.com", @router.claims(t).email
  end

  test "rejects a token from an unconfigured issuer" do
    stranger, = realm_verifier("https://kc.example/realms/stranger")
    bad = token(iss: "https://kc.example/realms/stranger", key: stranger)
    assert_raises(Auth::KeycloakAuthenticator::Error) { @router.subject(bad) }
  end

  test "rejects a token claiming one realm's iss but signed by another's key" do
    # The iss peek routes it to the odt verifier, whose JWKS then rejects the
    # external-realm signature — a forged iss can't cross realms.
    forged = token(iss: ODT_ISS, key: @ext_rsa)
    assert_raises(Auth::KeycloakAuthenticator::Error) { @router.subject(forged) }
  end

  test "rejects blank and garbage tokens" do
    assert_raises(Auth::KeycloakAuthenticator::Error) { @router.subject("") }
    assert_raises(Auth::KeycloakAuthenticator::Error) { @router.subject(nil) }
    assert_raises(Auth::KeycloakAuthenticator::Error) { @router.subject("not-a-jwt") }
  end

  test "from_env returns a single verifier without the external issuer" do
    auth = Auth::KeycloakAuthenticator.from_env({ "KEYCLOAK_ISSUER" => ODT_ISS })
    assert_instance_of Auth::KeycloakAuthenticator, auth
  end

  test "from_env returns a router when the external issuer is configured" do
    auth = Auth::KeycloakAuthenticator.from_env(
      { "KEYCLOAK_ISSUER" => ODT_ISS, "KEYCLOAK_EXTERNAL_ISSUER" => EXT_ISS }
    )
    assert_instance_of Auth::IssuerRouter, auth
  end
end
