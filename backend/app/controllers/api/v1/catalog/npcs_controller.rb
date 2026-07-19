module Api
  module V1
    module Catalog
      class NpcsController < BaseController
        # GET /api/v1/npcs — the NPC catalog (#259): identity rows with their
        # sprite image. Read-only for now (no admin CRUD page yet, #259 scope);
        # the decorate editor reads it to offer a trainer-payload picker and the
        # game reads it to resolve a fired trainer Zone's duel sprite.
        def index
          npcs = ::Catalog::Npc.order(:name)
          render json: npcs.map { |n| ::Catalog::NpcSerializer.call(n) }
        end
      end
    end
  end
end
