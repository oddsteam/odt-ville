class AddDoorAnchorToTileObjects < ActiveRecord::Migration[8.1]
  def change
    # Authored door cell for a "building" tile-object (issue #29), as a cell
    # offset from the footprint's top-left. The town places every plot's door
    # here instead of the hardcoded bottom-centre. Null for non-buildings.
    add_column :tile_objects, :door_dx, :integer
    add_column :tile_objects, :door_dy, :integer
  end
end
