class CreateUserContentStates < ActiveRecord::Migration[8.1]
  def change
    create_table :user_content_states do |t|
      t.references :user, null: false, foreign_key: true
      t.references :content_item, null: false, foreign_key: true
      # Enum: unread, opened, acknowledged
      t.string :state, null: false, default: "unread"
      t.datetime :opened_at
      t.datetime :acknowledged_at

      t.timestamps
    end

    add_index :user_content_states, [:user_id, :content_item_id], unique: true
  end
end
