module Catalog
  # JSON payload for the ground-tile catalog. A tile is just its atlas
  # coordinate + surface type — no image blob; the game crops the cell out of the
  # referenced tileset at render time (and the mapper roster does the same).
  module GroundTileSerializer
    module_function

    def call(t)
      {
        id: t.id,
        tile_type: t.tile_type,
        tileset: t.tileset,
        col: t.col,
        row: t.row,
        cell: t.cell,
        label: t.label,
        role: t.role,
        side: t.side,
        updated_at: t.updated_at
      }
    end
  end
end
