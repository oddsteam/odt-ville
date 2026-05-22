class CreateContentItems < ActiveRecord::Migration[8.1]
  def change
    create_table :content_items do |t|
      t.references :board, null: false, foreign_key: true
      t.string :title, null: false
      t.string :summary, null: false, default: ""
      t.text :body, null: false, default: ""
      # Enum: normal, important, urgent
      t.string :priority, null: false, default: "normal"
      t.datetime :effective_from
      t.datetime :expires_at
      t.boolean :requires_ack, null: false, default: false
      t.boolean :active, null: false, default: true

      t.timestamps
    end
  end
end
