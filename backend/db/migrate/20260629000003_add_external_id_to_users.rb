class AddExternalIdToUsers < ActiveRecord::Migration[8.1]
  # The OIDC subject (Keycloak `sub`) that a verified bearer token resolves to.
  # Nullable so pre-auth/local-only users keep working; unique so a subject maps
  # to exactly one local user (issue #92).
  def change
    add_column :users, :external_id, :string
    add_index :users, :external_id, unique: true
  end
end
