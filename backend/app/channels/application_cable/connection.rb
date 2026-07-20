module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user, :current_roles, :current_groups

    # Browsers cannot set an Authorization header on the WebSocket handshake
    # and the JWT lives in JS memory, not a cookie — so the token rides the
    # cable URL (?token=), verified through the same claims_resolver seam the
    # REST controllers use (request specs stub it identically, #92).
    def connect
      claims = verified_claims
      # No JIT provisioning here: the client has already loaded the map over
      # REST with this same token, which provisioned the user (#96).
      self.current_user = claims && Auth::User.find_by(external_id: claims.subject)
      reject_unauthorized_connection unless current_user
      self.current_roles = claims.roles || []
      self.current_groups = claims.groups || []
    end

    private

    def verified_claims
      token = request.params[:token]
      return nil if token.blank?

      ApplicationController.claims_resolver.call(token)
    rescue Auth::KeycloakAuthenticator::Error
      nil
    end
  end
end
