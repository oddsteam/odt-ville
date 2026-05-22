module Api
  module V1
    class HousesController < BaseController
      BOARD_TYPES = %w[must_know should_know nice_to_know].freeze

      # GET /api/v1/houses/:id
      def show
        house = current_user.company.houses.active
                            .includes(boards: { content_items: :user_content_states })
                            .find(params[:id])

        render json: HouseSerializer.call(house: house, user: current_user, now: Time.current)
      end

      # POST /api/v1/houses — admin: add a community. Creates the house, its
      # three boards, and a welcome item so the new building is not empty.
      def create
        company = current_user.company
        attrs = house_params

        house = company.houses.create!(
          title: attrs[:title].presence || "New Community",
          color: attrs[:color].presence || "#888888",
          logo_url: attrs[:logo_url].to_s,
          category_key: attrs[:category_key].presence || "community",
          position_order: (company.houses.maximum(:position_order) || 0) + 1,
          active: true,
        )

        BOARD_TYPES.each { |bt| house.boards.create!(board_type: bt) }
        house.boards.find_by(board_type: "must_know").content_items.create!(
          title: "Welcome to #{house.title}",
          summary: "This community space has just opened on the village map.",
          body: "Its Must Know, Should Know and Nice to Know boards are ready for updates.",
          priority: "normal",
          requires_ack: false,
          active: true,
          effective_from: Time.current,
        )

        render json: { id: house.id, title: house.title }, status: :created
      end

      # DELETE /api/v1/houses/:id — admin: remove a community (and its boards,
      # content and per-user state, via dependent: :destroy).
      def destroy
        house = current_user.company.houses.find(params[:id])
        house.destroy!
        head :no_content
      end

      private

      def house_params
        params.permit(:title, :color, :logo_url, :category_key)
      end
    end
  end
end
