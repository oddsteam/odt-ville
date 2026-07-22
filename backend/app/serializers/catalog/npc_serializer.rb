module Catalog
  # JSON payloads for the NPC catalog API (#259, reshaped in #260). One row:
  # identity plus the id of the mapped rig that draws it. The rig's frames are
  # *not* inlined — clients already load manifests through the character module
  # (the game's per-sheet rig cache, the admin's roster), so the NPC row carries
  # only the ref, exactly as a Prop carries `object_id` rather than its art.
  module NpcSerializer
    module_function

    def call(npc)
      {
        id: npc.id,
        name: npc.name,
        level: npc.level,
        enabled: npc.enabled,
        character_manifest_id: npc.character_manifest_id,
        updated_at: npc.updated_at
      }
    end
  end
end
