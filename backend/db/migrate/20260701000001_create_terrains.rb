class CreateTerrains < ActiveRecord::Migration[8.1]
  def change
    # A terrain is the surface type a ground tile paints (grass, road, water…).
    # `priority` is its stack position, low→high: the higher-priority terrain
    # owns a shared seam. This lived hardcoded in two frontend producers (the
    # town catalog + the editor's TERRAIN_PRIORITY); persisting it here makes
    # priority *data* (ADR-0004) so introducing/reordering a terrain needs no
    # code change.
    create_table :terrains do |t|
      t.string :name, null: false
      t.integer :priority, null: false, default: 0

      t.timestamps
    end

    # One row per surface type; the ground-tile create path upserts by name.
    add_index :terrains, :name, unique: true
    # Reads order by priority.
    add_index :terrains, :priority
  end
end
