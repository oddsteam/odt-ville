module Api
  module V1
    class MonstersController < BaseController
      # GET /api/v1/monsters — the roster (no image blobs). Probability for each
      # monster is computed server-side against one shared enabled-rate
      # denominator, so disabled monsters show 0% and the rest sum to 100%.
      def index
        monsters = Monster.order(:name)
        total = Monster.enabled_rate_total
        render json: monsters.map { |m| MonsterSerializer.summary(m, total) }
      end
    end
  end
end
