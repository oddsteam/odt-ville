module Catalog
  # An NPC in the shared catalog (#259, ADR-0008): identity for a placed
  # character — name, sprite, optional level. Duelling is a *role* a trainer
  # Zone payload assigns (`{ kind: 'trainer', npcId }`), not an identity, so the
  # same row can later wander or run a shop with no schema change. The mechanic
  # lives on the payload; only who-they-are lives here.
  class Npc < ApplicationRecord
    # The Catalog module keeps the empty table-name prefix for its grandfathered
    # tables (monsters, terrains, …); new catalog tables carry `catalog_`
    # explicitly (ADR-0010), so name the table rather than inherit the prefix.
    self.table_name = "catalog_npcs"

    validates :name, presence: true, uniqueness: true

    # An NPC's art is a mapped rig, not a still (#260) — NPCs are meant to walk,
    # and one image cannot face four directions. The sprite mapper is the single
    # place character art is authored; its roster feeds two tracks, a user
    # picking their own character (ADR-0009) and an admin picking an NPC's.
    #
    # Optional, matching the users FK: deleting a rig nullifies the ref and
    # leaves the NPC's identity intact rather than deleting a catalog row.
    belongs_to :character_manifest, class_name: "::Character::CharacterManifest", optional: true
  end
end
