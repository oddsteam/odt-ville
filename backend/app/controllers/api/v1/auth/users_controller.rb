module Api
  module V1
    module Auth
      # GET /api/v1/admin/users (#430): the read-only roster behind /admin/users
      # — who has logged in, and who is an admin right now.
      #
      # Each admin badge carries its SOURCE, because the grant/revoke slices
      # (#431, #432) can only touch the App ones, and the page has to make that
      # visible before it offers a button. App grants are auth_user_roles rows
      # (#429), knowable for everyone. Keycloak realm roles live in the token —
      # and the server can only read the REQUESTING user's token, never anyone
      # else's. So other users' rows carry their App grants only; the caller's
      # own row also carries their Keycloak roles. That asymmetry is a hard
      # limit, not an oversight: there is no way to read another user's JWT.
      class UsersController < BaseController
        before_action -> { require_role!("admin") }

        # The one authorization role this console surfaces. `admin` is the only
        # role the gate checks (#94) and the only one app grants allow (#431),
        # so a Keycloak role outside it is realm plumbing (offline_access,
        # default-roles-…) and not a badge worth showing.
        SURFACED_ROLES = %w[admin].freeze

        def index
          my_keycloak = (token_claims&.roles || []) & SURFACED_ROLES
          render json: ::Auth::User.includes(:user_roles).order(:name).map { |user|
            user_json(user, keycloak: user.id == current_user.id ? my_keycloak : [])
          }
        end

        private

        def user_json(user, keycloak:)
          {
            id: user.id,
            name: user.name,
            email: user.email,
            roles: user.user_roles.map { |r| { role: r.role, source: "app" } } +
                   keycloak.map { |r| { role: r, source: "keycloak" } }
          }
        end
      end
    end
  end
end
