class CreateCatalogNpcs < ActiveRecord::Migration[8.1]
  def change
    # The NPC catalog (#259, ADR-0008): the identity of a placed character —
    # who they are, not what they do. A trainer Zone payload's `npcId` points at
    # a row here the way a Prop's `object_id` points at a tile object. Carries the
    # `catalog_` module prefix per ADR-0010 (the grandfathered `monsters` table
    # predates the rule; new catalog tables carry it explicitly).
    create_table :catalog_npcs do |t|
      # Human-friendly key, unique across the catalog.
      t.string :name, null: false
      # The NPC sprite as a PNG data URL. Reuses the data-URL-text convention
      # from monsters/tile_objects; read/written behind the Npc#image_data_url
      # accessor seam so a future S3/MinIO swap doesn't touch callers.
      t.text :image, null: false
      # Optional battle level, shown by the duel screen when present (an NPC that
      # never duels leaves it unset — level is a duelling detail, not identity).
      t.integer :level
      # Disabled NPCs stay in the catalog but are hidden from the picker.
      t.boolean :enabled, null: false, default: true

      t.timestamps
    end

    add_index :catalog_npcs, :name, unique: true
  end
end
