class AddFgMaskToTileObjects < ActiveRecord::Migration[8.1]
  def change
    # Foreground / "in-front" mask for a "building" tile-object (issue #36): a
    # 1-bit, image-resolution bitmap (a PNG data URL whose alpha marks which
    # pixels of the house art render OVER the avatar). Heavy like :image, so the
    # serializer carries it only on the full object, never the roster summary.
    # Null for non-buildings / buildings without authored foliage.
    add_column :tile_objects, :fg_mask, :text
  end
end
