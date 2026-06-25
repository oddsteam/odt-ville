class AddWalkMaskToTileObjects < ActiveRecord::Migration[8.1]
  def change
    # Authored interior walk mask for a "building" tile-object (issue #32): a
    # row-major grid the size of the footprint, one char per cell ('#' = solid,
    # '.' = walkable porch/path). Stored newline-joined; the serializer splits
    # it back into rows. Null for non-buildings / unmapped buildings.
    add_column :tile_objects, :walk_mask, :text
  end
end
