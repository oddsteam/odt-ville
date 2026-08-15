module Api
  module V1
    module Auth
      # The one shape a `/admin/users` row takes, shared by the read roster
      # (#430) and the grant write (#431) so the two producers cannot drift —
      # a grant's response IS a fresh roster row.
      #
      # An App grant (auth_user_roles, #429) carries its granter and grant date
      # for the roster's audit line; a Keycloak realm role carries neither — it
      # lives in the token, not our DB. Keycloak roles are only ever the caller's
      # own: the server can read the REQUESTING user's token, never anyone else's.
      module RosterSerialization
        # The Keycloak realm roles worth a badge. `admin` is the only role the
        # gate checks (#94) and the only one App grants allow (#431); anything
        # else in the token is realm plumbing (offline_access, default-roles-…).
        SURFACED_ROLES = %w[admin].freeze

        def user_json(user, keycloak:)
          {
            id: user.id,
            name: user.name,
            email: user.email,
            roles: user.user_roles.map { |r|
              { role: r.role, source: "app",
                granted_by: r.granted_by&.name, granted_at: r.created_at.iso8601 }
            } + keycloak.map { |r| { role: r, source: "keycloak" } }
          }
        end

        # The surfaced Keycloak roles for a row — non-empty only for the caller's
        # own row, because another user's token is unreadable here.
        def surfaced_keycloak(user)
          return [] unless current_user && user.id == current_user.id

          (token_claims&.roles || []) & SURFACED_ROLES
        end
      end
    end
  end
end
