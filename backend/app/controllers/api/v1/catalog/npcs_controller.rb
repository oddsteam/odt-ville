module Api
  module V1
    module Catalog
      class NpcsController < BaseController
        # Catalog management requires the `admin` realm role (as monsters does);
        # reads stay open.
        before_action -> { require_role!("admin") }, only: %i[create update destroy]

        # GET /api/v1/npcs — the NPC catalog (#259): identity rows, each naming
        # the mapped rig that draws it. The decorate editor reads it to offer a
        # trainer-payload picker, the game reads it to resolve a fired trainer
        # Zone, and the NPC admin (#260) reads it as its roster — the row is
        # already complete, so the edit form pre-fills without a `show`.
        def index
          npcs = ::Catalog::Npc.order(:name)
          render json: npcs.map { |n| ::Catalog::NpcSerializer.call(n) }
        end

        # POST /api/v1/npcs — author a new NPC from the admin form (#260).
        # Explicit assignment, mirroring MonstersController#create. RecordInvalid
        # (a duplicate name) is rescued in ApplicationController as a 422.
        def create
          npc = ::Catalog::Npc.new(
            name: params[:name],
            character_manifest_id: params[:character_manifest_id].presence,
            level: params[:level].presence,
            enabled: params.key?(:enabled) ? params[:enabled] : true
          )
          npc.save!
          render json: ::Catalog::NpcSerializer.call(npc), status: :created
        end

        # PATCH /api/v1/npcs/:id — edit an existing NPC. Only the keys the form
        # actually sends are assigned, so omitting `character_manifest_id` leaves
        # the stored rig alone (the admin chose to keep it).
        def update
          npc = ::Catalog::Npc.find(params[:id])
          npc.name = params[:name] if params.key?(:name)
          npc.character_manifest_id = params[:character_manifest_id].presence if params.key?(:character_manifest_id)
          npc.level = params[:level].presence if params.key?(:level)
          npc.enabled = params[:enabled] if params.key?(:enabled)
          npc.save!
          render json: ::Catalog::NpcSerializer.call(npc)
        end

        # DELETE /api/v1/npcs/:id — drop an NPC from the catalog. A trainer Zone
        # still naming it resolves to nothing; the picker simply stops offering it.
        def destroy
          ::Catalog::Npc.find(params[:id]).destroy!
          head :no_content
        end
      end
    end
  end
end
