# Identity columns for the Keycloak POC. `external_id` is the OIDC `sub` claim
# (stable per Keycloak user); `email` is convenience metadata. Both are nullable
# so the seeded single-player user (no auth) keeps working.
class AddIdentityToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :external_id, :string
    add_column :users, :email, :string

    add_index :users, :external_id, unique: true, where: "external_id IS NOT NULL"
  end
end
