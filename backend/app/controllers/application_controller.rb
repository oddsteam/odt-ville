class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_invalid

  # Resolves a bearer token to the external subject id (the Keycloak `sub`).
  # A class-level seam so request specs can swap in a fake resolver instead of
  # minting real Keycloak JWTs (see test/test_helper.rb) — issue #92.
  class_attribute :subject_resolver, instance_writer: false,
    default: ->(token) { KeycloakAuthenticator.instance.subject(token) }

  private

  # The authenticated user, resolved from the `Authorization: Bearer <jwt>`
  # header. Returns nil when there is no token, or the token does not verify /
  # match a local user — callers gate on it via require_user!.
  def current_user
    @current_user ||= resolve_current_user
  end

  def resolve_current_user
    token = bearer_token
    return nil if token.blank?

    external_id = self.class.subject_resolver.call(token)
    external_id.present? ? User.find_by(external_id: external_id) : nil
  rescue KeycloakAuthenticator::Error
    nil
  end

  def bearer_token
    request.authorization.to_s[/\ABearer\s+(.+)\z/i, 1]
  end

  def require_user!
    return if current_user

    render json: { error: "Unauthorized" }, status: :unauthorized
  end

  def render_not_found(error = nil)
    label = (error.respond_to?(:model) && error.model) ? "#{error.model} not found" : "Not found"
    render json: { error: label }, status: :not_found
  end

  def render_invalid(error)
    render json: { error: error.message }, status: :unprocessable_entity
  end
end
