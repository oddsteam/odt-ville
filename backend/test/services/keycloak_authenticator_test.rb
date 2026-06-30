require "test_helper"
require "jwt"
require "openssl"

class KeycloakAuthenticatorTest < ActiveSupport::TestCase
  ISS = "https://kc.example/realms/odtville".freeze
  AUD = "odt-ville-web".freeze

  setup do
    @rsa = OpenSSL::PKey::RSA.generate(2048)
    @jwk = JWT::JWK.new(@rsa)
    @kid = @jwk.kid
    @load_count = 0
    loader = lambda do
      @load_count += 1
      { keys: [ @jwk.export ] }
    end
    @auth = KeycloakAuthenticator.new(issuer: ISS, audience: AUD, jwks_loader: loader)
  end

  # Mint a token signed by the realm's key, with valid claims unless overridden.
  def token(claims = {}, key: @rsa, kid: @kid)
    payload = {
      iss: ISS, aud: AUD, sub: "subject-123",
      iat: Time.now.to_i, exp: Time.now.to_i + 60
    }.merge(claims)
    JWT.encode(payload, key, "RS256", { kid: kid })
  end

  test "returns the sub claim for a valid token" do
    assert_equal "subject-123", @auth.subject(token)
  end

  test "rejects a token signed by an unknown key" do
    other = OpenSSL::PKey::RSA.generate(2048)
    bad = token({}, key: other, kid: "unknown-kid")
    assert_raises(KeycloakAuthenticator::Error) { @auth.subject(bad) }
  end

  test "rejects an expired token" do
    assert_raises(KeycloakAuthenticator::Error) do
      @auth.subject(token({ exp: Time.now.to_i - 30 }))
    end
  end

  test "rejects a token from the wrong issuer" do
    assert_raises(KeycloakAuthenticator::Error) do
      @auth.subject(token({ iss: "https://evil.example/realms/odtville" }))
    end
  end

  test "rejects a token for the wrong audience" do
    assert_raises(KeycloakAuthenticator::Error) do
      @auth.subject(token({ aud: "some-other-client" }))
    end
  end

  test "rejects a blank or nil token" do
    assert_raises(KeycloakAuthenticator::Error) { @auth.subject("") }
    assert_raises(KeycloakAuthenticator::Error) { @auth.subject(nil) }
  end

  test "rejects a structurally garbage token" do
    assert_raises(KeycloakAuthenticator::Error) { @auth.subject("not-a-jwt") }
  end

  test "caches the JWKS across verifications" do
    @auth.subject(token)
    @auth.subject(token)
    assert_equal 1, @load_count, "JWKS should be fetched once and reused"
  end

  test "claims expose subject, realm + client roles, and groups" do
    t = token({
      realm_access: { roles: %w[admin offline_access] },
      resource_access: { AUD => { roles: %w[uma_authorization] } },
      groups: %w[/staff]
    })
    claims = @auth.claims(t)

    assert_equal "subject-123", claims.subject
    assert_equal %w[admin offline_access uma_authorization], claims.roles
    assert_equal %w[/staff], claims.groups
  end

  test "claims default roles and groups to empty when the token carries none" do
    claims = @auth.claims(token)

    assert_equal [], claims.roles
    assert_equal [], claims.groups
  end
end
