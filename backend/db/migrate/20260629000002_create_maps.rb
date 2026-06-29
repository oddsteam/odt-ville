class CreateMaps < ActiveRecord::Migration[8.1]
  # The `maps` table is the persistence side of the runtime map contract
  # (ADR-0004): one shape the black-box game renders, emitted by two producers.
  # The authored producer persists here; the generated hometown stays per-user
  # and unpersisted. Both `source` (the editable truth) and `baked` (the
  # resolved tile grid the game blits) are stored, per ADR-0003 — autotiling is
  # baked in the producer, never at runtime.
  def change
    create_table :maps do |t|
      # URL-stable identity. `GET /maps/:slug` loads by this, not the numeric id.
      t.string :slug, null: false
      t.string :title, null: false, default: ""
      # Fixed map size in tiles — authored maps are not stretched to fit.
      t.integer :cols, null: false
      t.integer :rows, null: false
      # Source layout (painted terrain regions, placements, zones, spawns). The
      # editor re-opens a map from this; empty until the editor lands (#80+).
      t.jsonb :source, null: false, default: {}
      # Baked artifact — the resolved concrete tile grid + placed entities the
      # game renders with no runtime autotiling. This is what the runtime reads.
      t.jsonb :baked, null: false, default: {}

      t.timestamps
    end

    # One map per slug — the load key is unique.
    add_index :maps, :slug, unique: true
  end
end
