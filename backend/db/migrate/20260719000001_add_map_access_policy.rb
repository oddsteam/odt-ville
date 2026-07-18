# Map access gating (#83): the policy lives on the map as opaque jsonb the
# Maps::AccessPolicy value object interprets; memberships are the fine-grained
# game membership CONTEXT.md keeps in our DB (Keycloak stays claims-only).
class AddMapAccessPolicy < ActiveRecord::Migration[8.1]
  def change
    add_column :maps, :access_policy, :jsonb, null: false, default: { kind: "public" }

    create_table :maps_map_memberships do |t|
      t.references :map, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.timestamps
      t.index %i[map_id user_id], unique: true
    end
  end
end
