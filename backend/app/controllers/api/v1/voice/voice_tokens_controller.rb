module Api
  module V1
    module Voice
      # Mints a LiveKit room token for the *connecting* user (ADR-0011, #308).
      # The backend can only authorize the caller — a server-minted token does
      # exactly that, which is also why it sidesteps the #279 per-target
      # authorization hole. The room name derives from the requested map, or —
      # for a meeting room (#486) — from a meeting zone authored on it.
      class VoiceTokensController < BaseController
        # GET /api/v1/voice/token?map=:slug[&meeting=:roomId]
        def show
          room = params[:meeting].present? ? meeting_room : proximity_room
          return if performed? # a rejection already rendered

          jwt = ::Voice::RoomToken.mint(
            identity: current_user.external_id,
            name: current_user.name,
            room: room
          )
          render json: { token: jwt, room: room }
        end

        private

        # The proximity room derives straight from the slug — any authenticated
        # user may open the map's own room (#308).
        def proximity_room
          ::Voice::RoomKey.map(params.require(:map))
        end

        # A meeting room (#486) is authored, so the caller can't name an arbitrary
        # one: the roomId must belong to a meeting zone on a map they can reach.
        # Unknown slug → 404; unreachable map or unauthored room → 403.
        def meeting_room
          slug = params.require(:map)
          room_id = params[:meeting]
          map = ::Maps::Map.find_by!(slug: slug)
          unless reachable?(map) && meeting_zone?(map, room_id)
            render json: { error: "Forbidden" }, status: :forbidden
            return
          end

          ::Voice::RoomKey.meeting(room_id)
        end

        def reachable?(map)
          map.accessible_to?(current_user, roles: current_roles, groups: current_groups)
        end

        def meeting_zone?(map, room_id)
          zones = map.baked.is_a?(Hash) ? map.baked["zones"] || [] : []
          zones.any? do |zone|
            payload = zone["payload"] || {}
            payload["kind"] == "meeting" && payload["roomId"] == room_id
          end
        end
      end
    end
  end
end
