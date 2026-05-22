class CreateBoards < ActiveRecord::Migration[8.1]
  def change
    create_table :boards do |t|
      t.references :house, null: false, foreign_key: true
      # Enum: must_know, should_know, nice_to_know
      t.string :board_type, null: false

      t.timestamps
    end

    add_index :boards, [:house_id, :board_type], unique: true
  end
end
