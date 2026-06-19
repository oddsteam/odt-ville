class CreateCharacterManifests < ActiveRecord::Migration[8.1]
  def change
    create_table :character_manifests do |t|
      # Human-friendly key, also the manifest's own `name`. Upserted by the
      # sprite-mapper so re-saving the same character overwrites in place.
      t.string :name, null: false
      # The full manifest JSON (postures, grid, render, and — for uploaded
      # sheets — the inline data-URL). jsonb so we can query/inspect later.
      t.jsonb :data, null: false, default: {}
      # Exactly one manifest is the live character the game/preview loads.
      t.boolean :active, null: false, default: false

      t.timestamps
    end

    add_index :character_manifests, :name, unique: true
    # Enforce the single-active invariant at the DB level: at most one row
    # may have active = true.
    add_index :character_manifests, :active,
              unique: true,
              where: "active",
              name: "index_character_manifests_single_active"
  end
end
