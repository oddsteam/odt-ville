# Discord shell sign-in (#568, ADR-0022 / plan decision 1): a player who opens
# the Discord Activity is keyed by their Discord user id. Nullable — web
# (Keycloak) logins carry none; unique so a second launch reuses the row and a
# racing first launch raises rather than duplicates.
class AddDiscordIdToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :discord_id, :string
    add_index :users, :discord_id, unique: true
  end
end
