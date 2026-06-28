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

      # POST /api/v1/monsters — author a new monster from the admin form.
      # Explicit assignment (TileObjectsController#create style); the image data
      # URL goes through the model's read/write seam. RecordInvalid (duplicate
      # name, negative rate) is rescued in ApplicationController as a 422, so
      # validation errors surface to the admin rather than failing silently.
      def create
        monster = Monster.new(
          name: params[:name],
          image_data_url: params[:image],
          encounter_dialog: params[:encounter_dialog],
          encounter_rate: params.key?(:encounter_rate) ? params[:encounter_rate] : 0,
          enabled: params.key?(:enabled) ? params[:enabled] : true
        )
        monster.save!
        render json: MonsterSerializer.call(monster), status: :created
      end
    end
  end
end
