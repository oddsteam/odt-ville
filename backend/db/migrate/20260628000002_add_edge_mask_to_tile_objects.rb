class AddEdgeMaskToTileObjects < ActiveRecord::Migration[8.1]
  def change
    # Authored impassable cell borders for a "building" tile-object (issue #53):
    # a row-major grid the size of the footprint, one hex digit per cell whose
    # bits mark which sides block the avatar (N=1 E=2 S=4 W=8). Stored newline-
    # joined like walk_mask; the serializer splits it back into rows. Null for
    # non-buildings / buildings with no authored borders (today's free movement).
    add_column :tile_objects, :edge_mask, :text
  end
end
