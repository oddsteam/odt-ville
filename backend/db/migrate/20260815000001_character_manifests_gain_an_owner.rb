class CharacterManifestsGainAnOwner < ActiveRecord::Migration[8.1]
  def change
    # A manifest's owner (#394). Nullable means house-owned — the shared roster
    # the pickers list. A non-null owner is a personal Look (ADR-0017), kept out
    # of that roster. Deleting the user returns their rows to house-owned.
    add_reference :character_manifests, :owner,
      null: true, foreign_key: { to_table: :users, on_delete: :nullify }
  end
end
