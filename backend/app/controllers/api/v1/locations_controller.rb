module Api
  module V1
    class LocationsController < BaseController
      AREAS = %w[town house].freeze

      # PUT /api/v1/me/location
      # Persists only the coarse location (area / house / room) — never x/y.
      def update
        loc = current_user.location_state

        area = params[:last_area].to_s
        area = loc.last_area unless AREAS.include?(area)

        # Keep last_house_id only if it still maps to a house in this company.
        house_id = params[:last_house_id].presence
        unless house_id && current_user.company.houses.exists?(id: house_id)
          house_id = nil
        end

        loc.update!(
          last_area: area,
          last_house_id: house_id,
          last_room: params[:last_room].presence
        )

        render json: Serialization.location(loc)
      end
    end
  end
end
