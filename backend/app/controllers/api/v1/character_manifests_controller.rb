module Api
  module V1
    class CharacterManifestsController < BaseController
      # GET /api/v1/character_manifests — roster for pickers (no data blobs).
      def index
        manifests = CharacterManifest.order(:name)
        render json: manifests.map { |m| CharacterManifestSerializer.summary(m) }
      end

      # GET /api/v1/character_manifests/:id — full manifest (incl. data blob),
      # used by the roster to animate each saved character.
      def show
        manifest = CharacterManifest.find(params[:id])
        render json: CharacterManifestSerializer.call(manifest)
      end

      # GET /api/v1/character_manifests/active — the live character the game
      # and map preview load. 204 when nothing has been saved yet.
      def active
        manifest = CharacterManifest.current
        return head :no_content unless manifest

        render json: CharacterManifestSerializer.call(manifest)
      end

      # POST /api/v1/character_manifests — save from the sprite-mapper. Upserts
      # by manifest name and, unless `active: false` is passed, makes it the
      # one live character.
      def create
        data = manifest_data
        name = data["name"].presence
        if name.blank?
          return render json: { error: "manifest.name is required" },
                        status: :unprocessable_entity
        end

        manifest = CharacterManifest.find_or_initialize_by(name: name)
        manifest.update!(data: data)
        manifest.activate! unless params[:active] == false

        render json: CharacterManifestSerializer.call(manifest.reload)
      end

      private

      # The manifest is free-form nested JSON, so permit it wholesale rather
      # than enumerating every posture/grid key.
      def manifest_data
        params.require(:manifest).permit!.to_h
      end
    end
  end
end
