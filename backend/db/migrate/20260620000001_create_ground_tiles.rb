class CreateGroundTiles < ActiveRecord::Migration[8.1]
  def change
    create_table :ground_tiles do |t|
      # Surface type this cell paints — "grass", "road", "dirt"… Free text for
      # now; edge/corner roles get added as columns when autotiling lands.
      t.string :tile_type, null: false
      # The bundled tileset this cell lives in. Matches the name passed to
      # Phaser's addTilesetImage (and the PNG served from public/maps/tilesets).
      t.string :tileset, null: false
      # Cell position in the tileset grid, plus px per cell (16/32). We store the
      # coordinate — not a cropped PNG — so the atlas/neighbour relationship the
      # tilemap renderer (and future autotiling) needs is preserved.
      t.integer :col, null: false
      t.integer :row, null: false
      t.integer :cell, null: false, default: 32
      # Optional human note ("plain grass", "grass-edge-N"). No autotiling yet.
      t.string :label, null: false, default: ""

      t.timestamps
    end

    # One catalog entry per atlas cell — re-tagging a cell upserts, never dupes.
    add_index :ground_tiles, %i[tileset col row], unique: true,
              name: "index_ground_tiles_on_cell"
    # Group the roster by surface type.
    add_index :ground_tiles, :tile_type
  end
end
