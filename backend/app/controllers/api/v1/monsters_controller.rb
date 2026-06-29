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

      # GET /api/v1/monsters/:id — the full record incl. the image data URL, so
      # the admin edit form can pre-fill its fields and preview the current art.
      def show
        render json: MonsterSerializer.call(Monster.find(params[:id]))
      end

      # PATCH /api/v1/monsters/:id — edit an existing monster from the admin
      # form. Only the keys the form actually sends are assigned, so omitting
      # `image` leaves the stored blob untouched (the admin chose to keep it).
      # Saving recomputes every roster %; RecordInvalid (e.g. a duplicate name)
      # is rescued in ApplicationController as a 422 the admin sees.
      def update
        monster = Monster.find(params[:id])
        monster.name = params[:name] if params.key?(:name)
        monster.image_data_url = params[:image] if params.key?(:image)
        monster.encounter_dialog = params[:encounter_dialog] if params.key?(:encounter_dialog)
        monster.encounter_rate = params[:encounter_rate] if params.key?(:encounter_rate)
        monster.enabled = params[:enabled] if params.key?(:enabled)
        monster.save!
        render json: MonsterSerializer.call(monster)
      end
    end
  end
end
