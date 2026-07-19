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

    # Image read/write seam, mirrored verbatim from Catalog::Monster. The data
    # URL lives directly in the text column for now; routing every caller through
    # this accessor means a future move to S3/MinIO (store a key, fetch the blob)
    # changes only this one place.
    def image_data_url
      image
    end

    def image_data_url=(value)
      self.image = value
    end
  end
end
