module Api
  module V1
    module Character
      # Leading-colon `::Character::` refs jump to the domain module — inside
      # Api::V1::Character a bare `Character` would resolve to this namespace.
      class CharacterManifestsController < BaseController
        # Saving a manifest requires the `admin` realm role (#100); reads stay open.
        before_action -> { require_role!("admin") }, only: %i[create]

        # GET /api/v1/character_manifests — roster for pickers (no data blobs).
        def index
          manifests = ::Character::CharacterManifest.order(:name)
          render json: manifests.map { |m| ::Character::CharacterManifestSerializer.summary(m) }
        end

        # GET /api/v1/character_manifests/:id — full manifest (incl. data blob),
        # used by the roster to animate each saved character.
        def show
          manifest = ::Character::CharacterManifest.find(params[:id])
          render json: ::Character::CharacterManifestSerializer.call(manifest)
        end

        # GET /api/v1/character_manifests/active — the live character the game
        # and map preview load. 204 when nothing has been saved yet.
        def active
          manifest = ::Character::CharacterManifest.current
          return head :no_content unless manifest

          render json: ::Character::CharacterManifestSerializer.call(manifest)
        end

        # GET /api/v1/character_manifests/for_me — the character the current
        # user renders (#155, ADR-0009): their pick, else the global active.
        # 204 when neither exists (the client falls back to the committed
        # default).
        def for_me
          manifest = current_user.character_manifest || ::Character::CharacterManifest.current
          return head :no_content unless manifest

          render json: ::Character::CharacterManifestSerializer.call(manifest)
        end

        # POST /api/v1/character_manifests/:id/select — make this manifest the
        # current user's character. Writes only the caller's row; other users
        # and the global active are untouched.
        def select
          manifest = ::Character::CharacterManifest.find(params[:id])
          current_user.update!(character_manifest: manifest)
          render json: ::Character::CharacterManifestSerializer.summary(manifest)
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

          manifest = ::Character::CharacterManifest.find_or_initialize_by(name: name)
          manifest.update!(data: data)
          manifest.activate! unless params[:active] == false

          render json: ::Character::CharacterManifestSerializer.call(manifest.reload)
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
end
