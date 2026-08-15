module Api
  module V1
    module Auth
      # POST /api/v1/admin/users/:id/roles (#431): grant an App authorization
      # role from the console, so onboarding a game manager no longer needs
      # kcadm against the live realm. The grant is an auth_user_roles row (#429)
      # stamped with the acting admin; it reaches the gate on the grantee's next
      # page load — no Keycloak change, no re-login.
      class RolesController < BaseController
        include RosterSerialization

        before_action -> { require_role!("admin") }

        # The roles this console may grant. `admin` only for now — the owner
        # asked for all-access admin first; narrower tiers come later (#431).
        GRANTABLE_ROLES = %w[admin].freeze

        def create
          role = params[:role].to_s
          unless GRANTABLE_ROLES.include?(role)
            return render json: { error: "Unknown role: #{role.presence || '(blank)'}" },
                          status: :unprocessable_entity
          end

          user = ::Auth::User.find(params[:id])
          # Idempotent: the unique (user_id, role) index means a re-grant must
          # not 500. find_or_initialize keeps the original granter and date.
          grant = ::Auth::UserRole.find_or_initialize_by(user: user, role: role)
          grant.granted_by = current_user if grant.new_record?
          grant.save!

          render json: user_json(user, keycloak: surfaced_keycloak(user))
        end
      end
    end
  end
end
