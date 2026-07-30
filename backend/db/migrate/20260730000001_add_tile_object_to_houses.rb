# Per-community building assignment (#292): which mapped 'building' tile
# object this house renders on the generated hometown. Null = fall back to the
# active building object, then bundled art. Deleting the object clears the
# assignment (the community falls back rather than pointing at nothing).
class AddTileObjectToHouses < ActiveRecord::Migration[8.1]
  def change
    add_reference :houses, :tile_object, foreign_key: { on_delete: :nullify }
  end
end
