class CreateHouses < ActiveRecord::Migration[8.1]
  def change
    create_table :houses do |t|
      t.references :company, null: false, foreign_key: true
      t.string :title, null: false
      t.string :color, null: false, default: "#888888"
      t.string :logo_url, null: false, default: ""
      t.string :category_key, null: false
      t.integer :position_order, null: false, default: 0
      t.boolean :active, null: false, default: true

      t.timestamps
    end

    add_index :houses, [:company_id, :position_order]
  end
end
