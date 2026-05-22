class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_invalid

  private

  # This MVP prototype is single-player and has no authentication.
  # The server simply acts as the seed user. An optional X-User-Id header
  # lets you switch users when testing.
  def current_user
    @current_user ||= begin
      header_id = request.headers["X-User-Id"]
      (header_id.present? && User.find_by(id: header_id)) || User.first
    end
  end

  def require_user!
    return if current_user

    render json: { error: "No user found. Run `bin/rails db:seed` first." },
           status: :service_unavailable
  end

  def render_not_found(error = nil)
    label = (error.respond_to?(:model) && error.model) ? "#{error.model} not found" : "Not found"
    render json: { error: label }, status: :not_found
  end

  def render_invalid(error)
    render json: { error: error.message }, status: :unprocessable_entity
  end
end
