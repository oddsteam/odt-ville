module Api
  module V1
    module Discord
      # POST /api/v1/discord/move { guild_id, room } (#571, plan decisions 3 + 5).
      # Walking into a meeting zone moves the player's Discord client to the
      # voice channel whose name contains the zone's name.
      #
      # SECURITY: the member moved is always current_user.discord_id. The body
      # carries no user id we read — the spike's /move moved whoever it was
      # told to. The guild must be one we registered (Discord::Guild).
      class MovesController < BaseController
        # Seam for tests (no real Discord in the suite).
        class_attribute :discord_client, default: -> { ::Discord::Client.from_env }

        def create
          guild = ::Discord::Guild.find_by(guild_id: params[:guild_id].to_s)
          return error(:not_found, "unknown_guild") unless guild
          return error(:forbidden, "not_a_discord_player") if current_user.discord_id.blank?

          client = discord_client.call
          channel = client.voice_channel(guild.guild_id, params[:room])
          return error(:not_found, "no_voice_channel") unless channel

          client.move(guild.guild_id, current_user.discord_id, channel["id"])
          head :no_content
        rescue ::Discord::Client::Error => e
          Rails.logger.warn("discord move failed: #{e.message}")
          error(:bad_gateway, "move_failed")
        end

        private

        def error(status, code) = render(json: { error: code }, status: status)
      end
    end
  end
end
