# JSON payload for a terrain — just its name and stack priority. Both the town
# producer and the map editor read this to order their Tile Catalog's stack
# (seam ownership), replacing the priority they used to hardcode.
module TerrainSerializer
  module_function

  def call(t)
    {
      name: t.name,
      priority: t.priority
    }
  end
end
