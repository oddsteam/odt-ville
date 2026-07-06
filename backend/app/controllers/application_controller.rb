class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_invalid

  # Resolves a bearer token to its verified claims (subject + roles + groups).
  # A class-level seam so request specs can swap in a fake resolver instead of
  # minting real Keycloak JWTs (see test/test_helper.rb) — issues #92, #94.
  class_attribute :claims_resolver, instance_writer: false,
    default: ->(token) { KeycloakAuthenticator.instance.claims(token) }

  private

  # The verified token claims, or nil when there is no token / it does not
  # verify. Memoised so the resolver runs once per request.
  def token_claims
    return @token_claims if defined?(@token_claims)

    token = bearer_token
    @token_claims = token.blank? ? nil : self.class.claims_resolver.call(token)
  rescue KeycloakAuthenticator::Error
    @token_claims = nil
  end

  # The authenticated user, resolved from the token. A known subject maps
  # straight to its user; an unknown subject with an email is JIT-provisioned
  # (#96) — the org Keycloak is the access boundary, so there's no domain gate.
  # Returns nil otherwise, and callers gate via require_user!.
  def current_user
    @current_user ||= find_or_provision_user
  end

  def find_or_provision_user
    claims = token_claims
    sub = claims&.subject
    return nil if sub.blank?

    user = User.find_by(external_id: sub)
    return user if user

    # First login: provision (or re-link) by email so a later IdP swap — which
    # changes `sub` — reuses the same user instead of duplicating (#97).
    # ponytail: find_or_initialize races under concurrent first-logins; the
    # unique email index makes the loser raise rather than double-create.
    # No domain gate — the org Keycloak is the access-control boundary now (#97),
    # so any token it issues with an email provisions a user. Email is required
    # (we key on it); a token without one can't be provisioned.
    email = claims.email.to_s.downcase
    return nil if email.blank?

    user = User.find_or_initialize_by(email: email)
    user.external_id = sub
    if user.new_record?
      user.company = Company.first
      user.name = email.split("@").first
      user.role = "branch_employee"
    end
    return nil unless user.company

    user.save!
    user
  end

  # Realm + client roles / groups stamped into the token (#94).
  def current_roles
    token_claims&.roles || []
  end

  def current_groups
    token_claims&.groups || []
  end

  def bearer_token
    request.authorization.to_s[/\ABearer\s+(.+)\z/i, 1]
  end

  def require_user!
    return if current_user

    render json: { error: "Unauthorized" }, status: :unauthorized
  end

  # Coarse role gate (#94): 403 unless the token carries the named realm role.
  def require_role!(role)
    return if current_roles.include?(role)

    render json: { error: "Forbidden" }, status: :forbidden
  end

  def render_not_found(error = nil)
    label = (error.respond_to?(:model) && error.model) ? "#{error.model} not found" : "Not found"
    render json: { error: label }, status: :not_found
  end

  def render_invalid(error)
    render json: { error: error.message }, status: :unprocessable_entity
  end
end
