class CreateUserLocationStates < ActiveRecord::Migration[8.1]
  def change
    create_table :user_location_states do |t|
      # One location row per user.
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.references :company, null: false, foreign_key: true
      # Enum: town, house
      t.string :last_area, null: false, default: "town"
      # Deliberately NOT a foreign key: the referenced house may be deleted or
      # made inaccessible, in which case spawn logic falls back to Town Entrance.
      t.bigint :last_house_id
      t.string :last_room

      t.timestamps
    end
  end
end
