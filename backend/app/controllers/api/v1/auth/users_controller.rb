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

        # POST /api/v1/admin/users (#500): pre-provision a Client by email —
        # create the login row before their first sign-in and before their
        # Keycloak account, mirroring how an Org::Employee can exist before a
        # User. `external_id` stays nil: on first login the provisioner matches
        # them by email (find_or_initialize_by, ADR-0020) and stamps the sub,
        # keeping this row's `external`/`client_site`. Name defaults to the email
        # prefix, exactly as first-login provisioning does.
        def create
          email = params[:email].to_s.strip.downcase
          if email.blank?
            return render json: { error: "Email is required to pre-provision a user." },
                          status: :unprocessable_entity
          end
          if ::Auth::User.exists?(email: email)
            return render json: { error: "A user with #{email} already exists." },
                          status: :unprocessable_entity
          end

          user = current_user.company.users.create!(
            email: email,
            name: email.split("@").first,
            external: boolean_param(:external),
            client_site: params[:client_site].presence
          )
          render json: user_json(user, keycloak: []), status: :created
        end

        # PATCH /api/v1/admin/users/:id (#500): toggle `external` and set/clear
        # the app-assigned `client_site` on an existing user. A blank client_site
        # clears it (`presence` → nil); an absent key leaves the field untouched
        # so the console can send one field at a time.
        def update
          user = ::Auth::User.find(params[:id])
          user.external = boolean_param(:external) if params.key?(:external)
          user.client_site = params[:client_site].presence if params.key?(:client_site)
          user.save!

          render json: user_json(user, keycloak: surfaced_keycloak(user))
        end

        private

        def boolean_param(key)
          ActiveModel::Type::Boolean.new.cast(params[key])
        end
      end
    end
  end
end
