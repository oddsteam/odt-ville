module Api
  module V1
    module Character
      # Leading-colon `::Character::` refs jump to the domain module — inside
      # Api::V1::Character a bare `Character` would resolve to this namespace.
      class CharacterManifestsController < BaseController
        # Saving a manifest requires the `admin` realm role (#100); reads stay open.
        before_action -> { require_role!("admin") }, only: %i[create]

        # GET /api/v1/character_manifests — roster for pickers (no data blobs).
        # House-owned by default (#394); `?owner=me` returns the caller's own
        # personal rows instead, keeping them out of the shared roster.
        def index
          scope = params[:owner] == "me" ?
            ::Character::CharacterManifest.where(owner: current_user) :
            ::Character::CharacterManifest.house_owned
          manifests = scope.order(:name)
          render json: manifests.map { |m| ::Character::CharacterManifestSerializer.summary(m) }
        end

        # GET /api/v1/character_manifests/:id — full manifest (incl. data blob),
        # readable by id by any authenticated user. A peer must fetch a Look's
        # recipe to bake and render the wearer in the shared village (#398, #397),
        # and presence already broadcasts the manifest id to everyone on the map.
        # Privacy lives elsewhere: index stays house-owned so a Look is unlisted,
        # and save/select stay owner-scoped so no one wears another's Look (#394).
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
          manifest = current_user.effective_character_manifest
          return head :no_content unless manifest

          render json: ::Character::CharacterManifestSerializer.call(manifest)
        end

        # POST /api/v1/character_manifests/:id/select — make this manifest the
        # current user's character. Writes only the caller's row; other users
        # and the global active are untouched. A house-owned manifest or the
        # caller's own Look is wearable; a stranger's personal Look 404s (#398).
        def select
          manifest = ::Character::CharacterManifest
            .where(owner_id: [nil, current_user.id]).find(params[:id])
          current_user.update!(character_manifest: manifest)
          render json: ::Character::CharacterManifestSerializer.summary(manifest)
        end

        # POST /api/v1/character_manifests/looks — save a personal Look (#398,
        # ADR-0017): owner = caller, never globally active, capped at three and
        # slot-validated in the model. Auto-names when the ugly form sends none.
        def looks
          data = manifest_data
          look = ::Character::CharacterManifest.new(
            owner: current_user,
            name: data["name"].presence || default_look_name,
            active: false,
            data: data.except("name")
          )
          look.save!
          render json: ::Character::CharacterManifestSerializer.call(look), status: :created
        end

        # PATCH/PUT /api/v1/character_manifests/:id — update one of the caller's
        # own Looks in place (#424). Same id, so the worn pointer and peer
        # references (#397) survive; the model re-runs the slot rules. Other
        # users' Looks and house-owned rows 404, exactly like DELETE.
        def update
          look = ::Character::CharacterManifest.where(owner_id: current_user.id).find(params[:id])
          look.update!(data: manifest_data.except("name"))
          render json: ::Character::CharacterManifestSerializer.call(look)
        end

        # DELETE /api/v1/character_manifests/:id — drop one of the caller's own
        # Looks. House-owned rows and other users' Looks 404. Deleting a worn
        # Look nullifies the pick via the users FK, so the render falls back down
        # the ADR-0009 chain (global active → committed default).
        def destroy
          look = ::Character::CharacterManifest.where(owner_id: current_user.id).find(params[:id])
          look.destroy!
          head :no_content
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

        # First free "Look <owner>-<n>" for the caller — owner id embedded so the
        # name is globally unique (dodging the unique-name index) without a
        # per-owner name field the ugly form doesn't collect (#399 owns naming).
        def default_look_name
          taken = ::Character::CharacterManifest.where(owner: current_user).pluck(:name)
          n = 1
          n += 1 while taken.include?("Look #{current_user.id}-#{n}")
          "Look #{current_user.id}-#{n}"
        end
      end
    end
  end
end
