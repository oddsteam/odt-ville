module Api
  module V1
    class CommunitiesController < BaseController
      BOARD_TYPES = %w[must_know should_know nice_to_know].freeze

      # GET /api/v1/communities
      def index
        communities = current_user.company.houses.active.ordered
                                  .includes(boards: { content_items: :user_content_states })
                                  .to_a
        render json: CommunitiesSerializer.call(
          communities: communities, user: current_user, now: Time.current
        )
      end

      # GET /api/v1/communities/:id
      def show
        community = current_user.company.houses.active
                                .includes(boards: { content_items: :user_content_states })
                                .find(params[:id])
        render json: CommunitySerializer.call(
          community: community, user: current_user, now: Time.current
        )
      end

      # POST /api/v1/communities — admin: add a community. Creates the
      # community, its three boards, and a welcome item so it is not empty.
      def create
        company = current_user.company
        attrs = community_params

        community = company.houses.create!(
          title: attrs[:title].presence || "New Community",
          color: attrs[:color].presence || "#888888",
          logo_url: attrs[:logo_url].to_s,
          category_key: attrs[:category_key].presence || "community",
          position_order: (company.houses.maximum(:position_order) || 0) + 1,
          active: true
        )

        BOARD_TYPES.each { |bt| community.boards.create!(board_type: bt) }
        community.boards.find_by(board_type: "must_know").content_items.create!(
          title: "Welcome to #{community.title}",
          summary: "This community space has just opened on the map.",
          body: "Its Must Know, Should Know and Nice to Know boards are ready for updates.",
          priority: "normal",
          requires_ack: false,
          active: true,
          effective_from: Time.current
        )

        render json: { id: community.id, title: community.title }, status: :created
      end

      # DELETE /api/v1/communities/:id — admin: remove a community (and its
      # boards, content and per-user state, via dependent: :destroy).
      def destroy
        community = current_user.company.houses.find(params[:id])
        community.destroy!
        head :no_content
      end

      private

      def community_params
        params.permit(:title, :color, :logo_url, :category_key)
      end
    end
  end
end
