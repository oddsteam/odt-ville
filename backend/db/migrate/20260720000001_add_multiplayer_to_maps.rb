class AddMultiplayerToMaps < ActiveRecord::Migration[8.1]
  def change
    # Presence multiplayer (#88): a Node property per ADR-0005. Off by default;
    # the editor toggle arrives with #91.
    add_column :maps, :multiplayer, :boolean, default: false, null: false
  end
end
