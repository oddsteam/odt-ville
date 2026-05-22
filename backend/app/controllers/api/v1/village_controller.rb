module Api
  module V1
    class VillageController < BaseController
      # GET /api/v1/village
      def show
        company = current_user.company
        houses = company.houses.active.ordered
                        .includes(boards: { content_items: :user_content_states })
                        .to_a

        render json: VillageSerializer.call(
          company: company,
          user: current_user,
          houses: houses,
          now: Time.current
        )
      end
    end
  end
end
