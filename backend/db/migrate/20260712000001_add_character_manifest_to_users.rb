class AddCharacterManifestToUsers < ActiveRecord::Migration[8.1]
  def change
    # A user's picked character (#155, ADR-0009). Nullable: no pick means the
    # global active manifest, then the committed default. Deleting a manifest
    # returns its pickers to that fallback chain.
    add_reference :users, :character_manifest,
      null: true, foreign_key: { on_delete: :nullify }
  end
end
