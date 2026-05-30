class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_invalid

  private

  # Resolve the viewer for this request. Two modes coexist so the POC can layer
  # real logins on top of the original single-player prototype:
  #
  #   1. Keycloak (POC auth): if an `Authorization: Bearer <jwt>` header is
  #      present, verify it against Keycloak and provision/look up the matching
  #      local User. An invalid token is a hard 401 — we never fall through to
  #      the seed user when a caller *tried* to authenticate.
  #   2. No-auth fallback: with no bearer token, behave like the original MVP —
  #      use the optional X-User-Id header, else the first seeded user. This
  #      keeps `bin/rails server` + e2e usable without Keycloak running.
  def current_user
    @current_user
  end

  # Runs as a before_action (see Api::V1::BaseController). Populates
  # @current_user, or renders the appropriate error and halts.
  def authenticate_user!
    token = bearer_token

    if token
      claims = KeycloakAuth.verify(token)
      @current_user = User.from_keycloak_claims(claims)
    else
      @current_user = fallback_user
    end

    return if @current_user

    render json: { error: "No user found. Run `bin/rails db:seed` first." },
           status: :service_unavailable
  rescue KeycloakAuth::Error => e
    render json: { error: "Invalid or expired token: #{e.message}" }, status: :unauthorized
  end

  def bearer_token
    header = request.headers["Authorization"]
    return nil if header.blank?

    header[/\ABearer (.+)\z/, 1]
  end

  def fallback_user
    header_id = request.headers["X-User-Id"]
    (header_id.present? && User.find_by(id: header_id)) || User.first
  end

  def render_not_found(error = nil)
    label = (error.respond_to?(:model) && error.model) ? "#{error.model} not found" : "Not found"
    render json: { error: label }, status: :not_found
  end

  def render_invalid(error)
    render json: { error: error.message }, status: :unprocessable_entity
  end
end
