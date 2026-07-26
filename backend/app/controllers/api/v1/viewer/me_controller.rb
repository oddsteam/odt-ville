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
            user: {
              id: u.id, name: u.name, role: u.role, external_id: u.external_id,
              # Our proxy path, not the stored URL (ADR-0012) — the stored one is
              # a signed capability token. Null means "no avatar": the header
              # renders its fallback rather than requesting a 404.
              avatar_url: u.avatar_url && "/api/v1/users/#{u.external_id}/avatar"
            },
            company: { id: u.company.id, name: u.company.name },
            # Realm roles (#100) — the frontend gates the /admin route on these.
            roles: current_roles
          }
        end
      end
    end
  end
end
