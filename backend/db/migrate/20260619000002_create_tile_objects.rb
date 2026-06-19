class CreateTileObjects < ActiveRecord::Migration[8.1]
  def change
    create_table :tile_objects do |t|
      # Human-friendly key, upserted by the tile-object mapper.
      t.string :name, null: false
      # What the object is, so the game knows where to use it. For now:
      # "tree" / "prop" (rendered as tall overlay sprites). "building" later.
      t.string :kind, null: false, default: "prop"
      # The cropped object image as a PNG data URL. The admin drags a rectangle
      # over an uploaded atlas; the browser bakes that region into this PNG, so
      # the game never needs the atlas — it just draws this single image.
      t.text :image, null: false
      # On-grid footprint in tiles (how big to draw it on the map).
      t.float :footprint_w, null: false, default: 1
      t.float :footprint_h, null: false, default: 1
      # The live object of its kind that the game renders.
      t.boolean :active, null: false, default: false

      t.timestamps
    end

    add_index :tile_objects, :name, unique: true
    # At most one active object per kind (one live tree, one live building, …).
    add_index :tile_objects, :kind,
              unique: true,
              where: "active",
              name: "index_tile_objects_one_active_per_kind"
  end
end
