module Api
  module V1
    module Discord
      # POST /api/v1/discord/session { code } (#568, plan decisions 1 + 3).
      # The Discord Activity's sign-in: no Keycloak, so this is unauthenticated
      # (ApplicationController, not BaseController) and the OAuth code is the
      # credential. First launch provisions a fresh user in the default company;
      # later launches find it by discord_id.
      class SessionsController < ApplicationController
        # Seam for tests (no real Discord in the suite).
        class_attribute :discord_client, default: -> { ::Discord::Client.from_env }

        def create
          me = discord_client.call.identify(params[:code])
          user = find_or_create(me)
          render json: { token: ::Discord::SessionToken.issue(user), access_token: me["access_token"],
                         user: { name: user.name, external_id: user.external_id } }
        rescue ::Discord::Client::Error
          render json: { error: "Unauthorized" }, status: :unauthorized
        end

        private

        # external_id = "discord:<id>" because presence, cable, /me and avatars
        # all key on external_id. `external: false`: Discord players carry no
        # email to classify, and guild membership is this surface's scoping
        # (ADR-0022), so they're Staff. A racing first launch loses on the
        # unique index; the loser re-finds the winner's row.
        def find_or_create(me)
          ::Auth::User.find_or_create_by!(discord_id: me["id"]) do |u|
            u.external_id = "discord:#{me['id']}"
            u.name = me["global_name"].presence || me["username"]
            u.company = ::Org::Company.first!
            u.role = "branch_employee"
            u.external = false
          end
        rescue ActiveRecord::RecordNotUnique
          ::Auth::User.find_by!(discord_id: me["id"])
        end
      end
    end
  end
end
