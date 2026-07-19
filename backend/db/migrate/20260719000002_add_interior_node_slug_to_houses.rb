class AddInteriorNodeSlugToHouses < ActiveRecord::Migration[8.1]
  def change
    # The community's authored interior Node (#111, ADR-0005): the map slug its
    # door portals into. Null keeps the hardcoded InteriorScene (the v0 Node).
    add_column :houses, :interior_node_slug, :string
  end
end
