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
        include RosterSerialization

        before_action -> { require_role!("admin") }

        def index
          render json: ::Auth::User.includes(user_roles: :granted_by).order(:name).map { |user|
            user_json(user, keycloak: surfaced_keycloak(user))
          }
        end
      end
    end
  end
end
