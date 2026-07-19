module Catalog
  # JSON payloads for the NPC catalog API (#259). `summary` is the lightweight
  # identity row; `call` adds the sprite data URL. The list endpoint serves
  # `call` so it doubles as the decorate editor's picker and the runtime's
  # duel-sprite source — one catalog, one fetch (there are a handful of NPCs).
  module NpcSerializer
    module_function

    def summary(npc)
      {
        id: npc.id,
        name: npc.name,
        level: npc.level,
        enabled: npc.enabled,
        updated_at: npc.updated_at
      }
    end

    def call(npc)
      summary(npc).merge(image: npc.image_data_url)
    end
  end
end
