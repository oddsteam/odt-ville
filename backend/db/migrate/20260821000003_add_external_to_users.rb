# Staff / Client classification (#498): `external = true` marks a Client login
# (unproven staff), which the hometown read gates downtown buildings from.
# Nullable with no default on purpose — nil means "not yet classified", so
# provisioning and the returning-login path both backfill it from the domain
# match exactly once, while an admin flip later is preserved (never nil again).
class AddExternalToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :external, :boolean
  end
end
