module Api
  module V1
    module Discord
      # GET /api/v1/discord/guilds/:guild_id/map (#569): which map this Discord
      # server runs. An unregistered server 404s → "not set up yet" screen.
      # Only the slug — the Activity then loads the map through GET /maps/:slug,
      # which keeps the access gate in one place.
      class GuildsController < BaseController
        def map
          guild = ::Discord::Guild.includes(:map).find_by!(guild_id: params[:guild_id])
          render json: { slug: guild.map.slug }
        end
      end
    end
  end
end
