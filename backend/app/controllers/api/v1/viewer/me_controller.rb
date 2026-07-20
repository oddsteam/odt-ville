module Api
  module V1
    module Viewer
      # Tiny convenience endpoint for "who is logged in" — formerly bundled into
      # /api/v1/village. Kept separate so neither the communities surface nor
      # the game session leaks user/company concerns.
      class MeController < BaseController
        # GET /api/v1/me
        def show
          u = current_user
          render json: {
            # external_id is the stable Keycloak sub — presence frames (#88)
            # carry it, and the client filters its own echo by it.
            user: { id: u.id, name: u.name, role: u.role, external_id: u.external_id },
            company: { id: u.company.id, name: u.company.name },
            # Realm roles (#100) — the frontend gates the /admin route on these.
            roles: current_roles
          }
        end
      end
    end
  end
end
