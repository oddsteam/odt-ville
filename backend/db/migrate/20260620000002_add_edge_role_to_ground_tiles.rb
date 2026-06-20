class AddEdgeRoleToGroundTiles < ActiveRecord::Migration[8.1]
  def change
    # How a cell is used at a region boundary. "fill" is the interior tile (the
    # default, what every existing row already is); "edge" is a transition tile.
    add_column :ground_tiles, :role, :string, null: false, default: "fill"
    # Which side the edge faces — N/E/S/W. Null for fill tiles. Corners come
    # later; this MVP is orthogonal sides only.
    add_column :ground_tiles, :side, :string
  end
end
