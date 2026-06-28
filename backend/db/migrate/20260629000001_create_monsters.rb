class CreateMonsters < ActiveRecord::Migration[8.1]
  def change
    create_table :monsters do |t|
      # Human-friendly key, unique across the roster.
      t.string :name, null: false
      # The monster sprite as a PNG data URL. Reuses the data-URL-text
      # convention from tile_objects; read/written behind the Monster#image
      # accessor seam so a future S3/MinIO swap doesn't touch callers.
      t.text :image, null: false
      # Line the monster speaks when it ambushes the player (wild encounter).
      t.text :encounter_dialog
      # Weight in the wild-encounter pool. Probability for a monster is its rate
      # over the sum of all enabled monsters' rates.
      t.integer :encounter_rate, null: false, default: 0
      # Disabled monsters stay in the roster but are excluded from the pool.
      t.boolean :enabled, null: false, default: true

      t.timestamps
    end

    add_index :monsters, :name, unique: true
  end
end
