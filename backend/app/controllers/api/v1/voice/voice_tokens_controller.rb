module Api
  module V1
    module Voice
      # Mints a LiveKit room token for the *connecting* user (ADR-0011, #308).
      # The backend can only authorize the caller — a server-minted token does
      # exactly that, which is also why it sidesteps the #279 per-target
      # authorization hole. The room name derives from the requested map.
      class VoiceTokensController < BaseController
        # GET /api/v1/voice/token?map=:slug
        def show
          room = "map-#{params.require(:map)}"
          jwt = ::Voice::RoomToken.mint(
            identity: current_user.external_id,
            name: current_user.name,
            room: room
          )
          render json: { token: jwt, room: room }
        end
      end
    end
  end
end
