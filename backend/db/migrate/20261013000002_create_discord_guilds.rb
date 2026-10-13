# Discord shell server → map registry (#569, plan decision 2): one row per
# Discord server (guild) that runs the Activity, naming the map it renders.
# Rows are added by hand with `rails runner` — no admin UI in v1. No Site link
# (sites retire at stage 2).
class CreateDiscordGuilds < ActiveRecord::Migration[8.1]
  def change
    create_table :discord_guilds do |t|
      t.string :guild_id, null: false, index: { unique: true }
      t.references :map, null: false, foreign_key: true
      t.timestamps
    end
  end
end
