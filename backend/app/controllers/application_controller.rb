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

  # The authenticated user, resolved from the token's subject against the local
  # users. Returns nil when unauthenticated or the subject matches no user —
  # callers gate on it via require_user!.
  def current_user
    @current_user ||= begin
      sub = token_claims&.subject
      sub.present? ? User.find_by(external_id: sub) : nil
    end
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
